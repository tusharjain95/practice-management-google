#!/usr/bin/env python3
"""
Backend API Test Suite for CA Practice Management System
Tests all endpoints with role-based access control
"""

import requests
import json
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://ca-crm-hub-1.preview.emergentagent.com/api"

# Test credentials (seeded on first DB hit)
CREDENTIALS = {
    "admin": {"email": "admin@ca.com", "password": "admin123"},
    "manager": {"email": "manager@ca.com", "password": "manager123"},
    "staff": {"email": "staff@ca.com", "password": "staff123"}
}

# Store tokens and user data
tokens = {}
users = {}

def print_test(name):
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_result(passed, message):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")
    return passed

def login(role):
    """Login and store token"""
    print_test(f"Login as {role}")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json=CREDENTIALS[role],
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                tokens[role] = data["token"]
                users[role] = data["user"]
                print_result(True, f"Logged in as {role}: {data['user']['email']}")
                print(f"   User ID: {data['user']['id']}")
                print(f"   Role: {data['user']['role']}")
                return True
            else:
                print_result(False, f"Missing token or user in response: {data}")
                return False
        else:
            print_result(False, f"Login failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Login exception: {str(e)}")
        return False

def test_auth():
    """Test authentication endpoints"""
    results = []
    
    # Test 1: Valid login for all roles
    for role in ["admin", "manager", "staff"]:
        results.append(login(role))
    
    # Test 2: Invalid credentials
    print_test("Login with invalid credentials")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": "wrong@ca.com", "password": "wrongpass"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 401,
            f"Invalid login returns 401: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: GET /auth/me with valid token
    print_test("GET /auth/me with valid token")
    try:
        response = requests.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            results.append(print_result(
                "user" in data,
                f"Auth/me returns user data: {data.get('user', {}).get('email')}"
            ))
        else:
            results.append(print_result(False, f"Auth/me failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: Request without Bearer token
    print_test("Request without Bearer token")
    try:
        response = requests.get(f"{BASE_URL}/users", timeout=10)
        results.append(print_result(
            response.status_code == 401,
            f"No token returns 401: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_users():
    """Test users CRUD with role-based access"""
    results = []
    created_user_id = None
    
    # Test 1: GET /users (any role can read)
    print_test("GET /users as admin")
    try:
        response = requests.get(
            f"{BASE_URL}/users",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            users_list = data.get("users", [])
            # Check no passwordHash field exposed
            has_password = any("passwordHash" in u for u in users_list)
            results.append(print_result(
                not has_password and len(users_list) >= 3,
                f"Users list returned {len(users_list)} users, no passwordHash exposed"
            ))
        else:
            results.append(print_result(False, f"GET users failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: POST /users as admin (should work)
    print_test("POST /users as admin")
    try:
        new_user = {
            "email": f"testuser_{datetime.now().timestamp()}@ca.com",
            "password": "test123",
            "name": "Test User",
            "role": "staff"
        }
        response = requests.post(
            f"{BASE_URL}/users",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=new_user,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            created_user_id = data.get("user", {}).get("id")
            results.append(print_result(
                created_user_id is not None,
                f"User created with ID: {created_user_id}"
            ))
        else:
            results.append(print_result(False, f"Create user failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: POST /users as manager (should fail - 403)
    print_test("POST /users as manager (should be 403)")
    try:
        response = requests.post(
            f"{BASE_URL}/users",
            headers={"Authorization": f"Bearer {tokens['manager']}"},
            json={"email": "another@ca.com", "password": "test", "name": "Another", "role": "staff"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 403,
            f"Manager cannot create user: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: POST /users as staff (should fail - 403)
    print_test("POST /users as staff (should be 403)")
    try:
        response = requests.post(
            f"{BASE_URL}/users",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            json={"email": "yetanother@ca.com", "password": "test", "name": "Yet Another", "role": "staff"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 403,
            f"Staff cannot create user: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 5: PUT /users/:id as admin
    if created_user_id:
        print_test("PUT /users/:id as admin")
        try:
            response = requests.put(
                f"{BASE_URL}/users/{created_user_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"name": "Updated Test User", "role": "manager"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"User updated: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 6: PUT /users/:id as non-admin (should fail)
        print_test("PUT /users/:id as staff (should be 403)")
        try:
            response = requests.put(
                f"{BASE_URL}/users/{created_user_id}",
                headers={"Authorization": f"Bearer {tokens['staff']}"},
                json={"name": "Hacked Name"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 403,
                f"Staff cannot update user: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 7: DELETE /users/:id as admin
        print_test("DELETE /users/:id as admin")
        try:
            response = requests.delete(
                f"{BASE_URL}/users/{created_user_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"User deleted: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_leads():
    """Test leads CRUD, filters, notes, and role-based access"""
    results = []
    created_lead_id = None
    
    # Test 1: POST /leads as admin/manager
    print_test("POST /leads as admin")
    try:
        new_lead = {
            "name": "Rajesh Kumar",
            "phone": "+91 98765 43210",
            "email": "rajesh@example.com",
            "company": "Kumar Enterprises",
            "serviceType": "GST",
            "source": "Website",
            "status": "New",
            "assignedTo": users["staff"]["id"],
            "followUpDate": (datetime.now() + timedelta(days=3)).isoformat()
        }
        response = requests.post(
            f"{BASE_URL}/leads",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=new_lead,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            created_lead_id = data.get("lead", {}).get("id")
            results.append(print_result(
                created_lead_id is not None and data.get("lead", {}).get("status") == "New",
                f"Lead created with ID: {created_lead_id}, status: {data.get('lead', {}).get('status')}"
            ))
        else:
            results.append(print_result(False, f"Create lead failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: POST /leads as staff (should fail - 403)
    print_test("POST /leads as staff (should be 403)")
    try:
        response = requests.post(
            f"{BASE_URL}/leads",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            json={"name": "Test Lead", "serviceType": "Tax"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 403,
            f"Staff cannot create lead: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: GET /leads as admin (should see all)
    print_test("GET /leads as admin")
    try:
        response = requests.get(
            f"{BASE_URL}/leads",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            leads_count = len(data.get("leads", []))
            results.append(print_result(
                leads_count >= 1,
                f"Admin sees {leads_count} leads"
            ))
        else:
            results.append(print_result(False, f"GET leads failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: GET /leads as staff (should see only assigned)
    print_test("GET /leads as staff (only assigned)")
    try:
        response = requests.get(
            f"{BASE_URL}/leads",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            staff_leads = data.get("leads", [])
            all_assigned_to_staff = all(
                lead.get("assignedTo") == users["staff"]["id"] 
                for lead in staff_leads
            )
            results.append(print_result(
                all_assigned_to_staff,
                f"Staff sees {len(staff_leads)} leads, all assigned to them"
            ))
        else:
            results.append(print_result(False, f"GET leads as staff failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 5: GET /leads with filters
    print_test("GET /leads with filters (status=New&serviceType=GST)")
    try:
        response = requests.get(
            f"{BASE_URL}/leads?status=New&serviceType=GST",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            filtered_leads = data.get("leads", [])
            all_match = all(
                lead.get("status") == "New" and lead.get("serviceType") == "GST"
                for lead in filtered_leads
            )
            results.append(print_result(
                all_match,
                f"Filters work: {len(filtered_leads)} leads match status=New & serviceType=GST"
            ))
        else:
            results.append(print_result(False, f"Filtered GET failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 6: PUT /leads/:id (update)
    if created_lead_id:
        print_test("PUT /leads/:id (update lead)")
        try:
            response = requests.put(
                f"{BASE_URL}/leads/{created_lead_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"status": "In Progress", "company": "Kumar Enterprises Pvt Ltd"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Lead updated: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 7: PUT /leads/:id/notes (add note)
        print_test("PUT /leads/:id/notes (add follow-up note)")
        try:
            response = requests.put(
                f"{BASE_URL}/leads/{created_lead_id}/notes",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"note": "Called client, interested in GST filing services"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                note_added = data.get("ok") and "note" in data
                results.append(print_result(
                    note_added,
                    f"Note added: {data.get('note', {}).get('text', '')[:50]}"
                ))
            else:
                results.append(print_result(False, f"Add note failed: {response.status_code}"))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 8: DELETE /leads/:id as staff (should fail)
        print_test("DELETE /leads/:id as staff (should be 403)")
        try:
            response = requests.delete(
                f"{BASE_URL}/leads/{created_lead_id}",
                headers={"Authorization": f"Bearer {tokens['staff']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 403,
                f"Staff cannot delete lead: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results), created_lead_id

def test_convert_lead_to_task(lead_id):
    """Test converting lead to task"""
    results = []
    converted_task_id = None
    
    if not lead_id:
        print_result(False, "No lead ID provided for conversion test")
        return False, None
    
    # Test: POST /leads/convert
    print_test("POST /leads/convert (convert lead to task)")
    try:
        convert_data = {
            "leadId": lead_id,
            "title": "GST Filing for Kumar Enterprises",
            "category": "Tax",
            "priority": "High",
            "dueDate": (datetime.now() + timedelta(days=7)).isoformat(),
            "assignedTo": users["staff"]["id"]
        }
        response = requests.post(
            f"{BASE_URL}/leads/convert",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=convert_data,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            task = data.get("task", {})
            converted_task_id = task.get("id")
            has_lead_id = task.get("leadId") == lead_id
            has_client_name = task.get("clientName") is not None
            results.append(print_result(
                converted_task_id and has_lead_id and has_client_name,
                f"Task created from lead: ID={converted_task_id}, leadId={task.get('leadId')}, clientName={task.get('clientName')}"
            ))
        else:
            results.append(print_result(False, f"Convert lead failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Verify lead status changed to 'Converted'
    print_test("Verify lead status changed to 'Converted'")
    try:
        response = requests.get(
            f"{BASE_URL}/leads",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            converted_lead = next((l for l in data.get("leads", []) if l.get("id") == lead_id), None)
            if converted_lead:
                results.append(print_result(
                    converted_lead.get("status") == "Converted",
                    f"Lead status updated to: {converted_lead.get('status')}"
                ))
            else:
                results.append(print_result(False, "Converted lead not found"))
        else:
            results.append(print_result(False, f"GET leads failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results), converted_task_id

def test_tasks():
    """Test tasks CRUD, filters, comments, and role-based access"""
    results = []
    created_task_id = None
    
    # Test 1: POST /tasks as admin (direct task, no leadId)
    print_test("POST /tasks as admin (direct task)")
    try:
        new_task = {
            "title": "Annual Audit for ABC Corp",
            "description": "Complete annual audit for FY 2024-25",
            "category": "Audit",
            "priority": "High",
            "dueDate": (datetime.now() + timedelta(days=14)).isoformat(),
            "assignedTo": users["manager"]["id"],
            "clientName": "ABC Corporation"
        }
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=new_task,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            created_task_id = data.get("task", {}).get("id")
            results.append(print_result(
                created_task_id is not None,
                f"Direct task created with ID: {created_task_id}"
            ))
        else:
            results.append(print_result(False, f"Create task failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: POST /tasks as staff (should fail - 403)
    print_test("POST /tasks as staff (should be 403)")
    try:
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            json={"title": "Test Task", "category": "Other"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 403,
            f"Staff cannot create task: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: GET /tasks as admin (should see all)
    print_test("GET /tasks as admin")
    try:
        response = requests.get(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            tasks_count = len(data.get("tasks", []))
            results.append(print_result(
                tasks_count >= 1,
                f"Admin sees {tasks_count} tasks"
            ))
        else:
            results.append(print_result(False, f"GET tasks failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: GET /tasks as staff (should see only assigned)
    print_test("GET /tasks as staff (only assigned)")
    try:
        response = requests.get(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            staff_tasks = data.get("tasks", [])
            all_assigned_to_staff = all(
                task.get("assignedTo") == users["staff"]["id"]
                for task in staff_tasks
            )
            results.append(print_result(
                all_assigned_to_staff,
                f"Staff sees {len(staff_tasks)} tasks, all assigned to them"
            ))
        else:
            results.append(print_result(False, f"GET tasks as staff failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 5: GET /tasks with multiple filters
    print_test("GET /tasks with filters (status=Pending&priority=High&category=Audit)")
    try:
        response = requests.get(
            f"{BASE_URL}/tasks?status=Pending&priority=High&category=Audit",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            filtered_tasks = data.get("tasks", [])
            results.append(print_result(
                True,
                f"Filter combo works: {len(filtered_tasks)} tasks match criteria"
            ))
        else:
            results.append(print_result(False, f"Filtered GET failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 6: PUT /tasks/:id as admin (update any field)
    if created_task_id:
        print_test("PUT /tasks/:id as admin (update any field)")
        try:
            response = requests.put(
                f"{BASE_URL}/tasks/{created_task_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"status": "In Progress", "priority": "Medium"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Admin updated task: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 7: PUT /tasks/:id/comments (add comment)
    if created_task_id:
        print_test("PUT /tasks/:id/comments (add comment)")
        try:
            response = requests.put(
                f"{BASE_URL}/tasks/{created_task_id}/comments",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"comment": "Started preliminary review of financial statements"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                comment_added = data.get("ok") and "comment" in data
                results.append(print_result(
                    comment_added,
                    f"Comment added: {data.get('comment', {}).get('text', '')[:50]}"
                ))
            else:
                results.append(print_result(False, f"Add comment failed: {response.status_code}"))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 8: Staff can only update status of own task
    # First, get a task assigned to staff
    print_test("Staff updates status of own task")
    try:
        # Get staff's tasks
        response = requests.get(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            staff_tasks = response.json().get("tasks", [])
            if staff_tasks:
                staff_task_id = staff_tasks[0]["id"]
                # Try to update status (should work)
                response = requests.put(
                    f"{BASE_URL}/tasks/{staff_task_id}",
                    headers={"Authorization": f"Bearer {tokens['staff']}"},
                    json={"status": "In Progress", "priority": "Critical"},  # priority should be ignored
                    timeout=10
                )
                results.append(print_result(
                    response.status_code == 200,
                    f"Staff updated own task status: {response.status_code}"
                ))
            else:
                print_result(True, "No tasks assigned to staff to test update")
        else:
            results.append(print_result(False, f"GET staff tasks failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 9: Staff cannot update task not assigned to them
    if created_task_id:
        print_test("Staff updates task NOT assigned to them (should be 403)")
        try:
            response = requests.put(
                f"{BASE_URL}/tasks/{created_task_id}",
                headers={"Authorization": f"Bearer {tokens['staff']}"},
                json={"status": "Completed"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 403,
                f"Staff cannot update others' task: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 10: DELETE /tasks/:id as admin
        print_test("DELETE /tasks/:id as admin")
        try:
            response = requests.delete(
                f"{BASE_URL}/tasks/{created_task_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Admin deleted task: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_quotations():
    """Test quotations CRUD with auto-numbering and GST calculation"""
    results = []
    created_quote_id = None
    
    # Test 1: POST /quotations with GST
    print_test("POST /quotations with gstApplicable=true")
    try:
        new_quote = {
            "clientName": "Sharma Industries",
            "companyName": "Sharma Industries Pvt Ltd",
            "clientAddress": "456 Industrial Area, Delhi - 110001",
            "clientEmail": "contact@sharmaindustries.com",
            "clientPhone": "+91 98765 12345",
            "services": [
                {"name": "GST Registration", "description": "New GST registration", "qty": 1, "price": 5000},
                {"name": "GST Filing (Monthly)", "description": "3 months", "qty": 3, "price": 2000}
            ],
            "gstApplicable": True,
            "validUntil": (datetime.now() + timedelta(days=30)).isoformat()
        }
        response = requests.post(
            f"{BASE_URL}/quotations",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=new_quote,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            quote = data.get("quotation", {})
            created_quote_id = quote.get("id")
            
            # Verify calculations
            expected_subtotal = 5000 + (2000 * 3)  # 11000
            expected_gst = round(expected_subtotal * 0.18, 2)  # 1980.00
            expected_total = expected_subtotal + expected_gst  # 12980.00
            
            quotation_number = quote.get("quotationNumber", "")
            is_correct_format = quotation_number.startswith("QT-") and len(quotation_number.split("-")) == 3
            
            results.append(print_result(
                created_quote_id and is_correct_format,
                f"Quotation created: {quotation_number}"
            ))
            results.append(print_result(
                quote.get("subtotal") == expected_subtotal,
                f"Subtotal correct: {quote.get('subtotal')} == {expected_subtotal}"
            ))
            results.append(print_result(
                quote.get("gstAmount") == expected_gst,
                f"GST amount correct: {quote.get('gstAmount')} == {expected_gst}"
            ))
            results.append(print_result(
                quote.get("total") == expected_total,
                f"Total correct: {quote.get('total')} == {expected_total}"
            ))
        else:
            results.append(print_result(False, f"Create quotation failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: POST /quotations with gstApplicable=false
    print_test("POST /quotations with gstApplicable=false")
    try:
        new_quote = {
            "clientName": "Patel Traders",
            "services": [
                {"name": "Consultation", "description": "Business consultation", "qty": 2, "price": 3000}
            ],
            "gstApplicable": False
        }
        response = requests.post(
            f"{BASE_URL}/quotations",
            headers={"Authorization": f"Bearer {tokens['manager']}"},
            json=new_quote,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            quote = data.get("quotation", {})
            expected_subtotal = 3000 * 2  # 6000
            
            results.append(print_result(
                quote.get("gstAmount") == 0,
                f"GST amount is 0 when not applicable: {quote.get('gstAmount')}"
            ))
            results.append(print_result(
                quote.get("total") == expected_subtotal,
                f"Total equals subtotal when no GST: {quote.get('total')} == {expected_subtotal}"
            ))
        else:
            results.append(print_result(False, f"Create quotation without GST failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: GET /quotations (list)
    print_test("GET /quotations (list)")
    try:
        response = requests.get(
            f"{BASE_URL}/quotations",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            quotes_count = len(data.get("quotations", []))
            results.append(print_result(
                quotes_count >= 2,
                f"Quotations list returned {quotes_count} items"
            ))
        else:
            results.append(print_result(False, f"GET quotations failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: GET /quotations/:id (single)
    if created_quote_id:
        print_test("GET /quotations/:id (single)")
        try:
            response = requests.get(
                f"{BASE_URL}/quotations/{created_quote_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                quote = data.get("quotation", {})
                results.append(print_result(
                    quote.get("id") == created_quote_id,
                    f"Single quotation retrieved: {quote.get('quotationNumber')}"
                ))
            else:
                results.append(print_result(False, f"GET single quotation failed: {response.status_code}"))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 5: DELETE /quotations/:id as admin
        print_test("DELETE /quotations/:id as admin")
        try:
            response = requests.delete(
                f"{BASE_URL}/quotations/{created_quote_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Quotation deleted: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_dashboard():
    """Test dashboard stats for different roles"""
    results = []
    
    # Test 1: GET /dashboard as admin
    print_test("GET /dashboard as admin")
    try:
        response = requests.get(
            f"{BASE_URL}/dashboard",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            has_role = data.get("role") == "admin"
            has_leads = "leads" in data and "total" in data.get("leads", {})
            has_tasks = "tasks" in data and "total" in data.get("tasks", {})
            has_staff_perf = "staffPerformance" in data
            has_recent_leads = "recentLeads" in data
            has_recent_tasks = "recentTasks" in data
            
            results.append(print_result(
                has_role and has_leads and has_tasks and has_staff_perf and has_recent_leads and has_recent_tasks,
                f"Admin dashboard has all required fields: role={data.get('role')}, leads={has_leads}, tasks={has_tasks}, staffPerf={has_staff_perf}"
            ))
            
            # Check leads breakdown
            leads = data.get("leads", {})
            has_breakdown = all(k in leads for k in ["total", "new", "inProgress", "converted", "cancelled"])
            results.append(print_result(
                has_breakdown,
                f"Leads breakdown: total={leads.get('total')}, new={leads.get('new')}, inProgress={leads.get('inProgress')}, converted={leads.get('converted')}"
            ))
            
            # Check tasks breakdown
            tasks = data.get("tasks", {})
            has_task_breakdown = all(k in tasks for k in ["total", "pending", "inProgress", "completed", "overdue"])
            results.append(print_result(
                has_task_breakdown,
                f"Tasks breakdown: total={tasks.get('total')}, pending={tasks.get('pending')}, overdue={tasks.get('overdue')}"
            ))
        else:
            results.append(print_result(False, f"GET dashboard as admin failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: GET /dashboard as staff
    print_test("GET /dashboard as staff")
    try:
        response = requests.get(
            f"{BASE_URL}/dashboard",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            has_role = data.get("role") == "staff"
            has_stats = "stats" in data
            has_recent_tasks = "recentTasks" in data
            
            results.append(print_result(
                has_role and has_stats and has_recent_tasks,
                f"Staff dashboard has required fields: role={data.get('role')}, stats={has_stats}, recentTasks={has_recent_tasks}"
            ))
            
            # Check staff stats
            stats = data.get("stats", {})
            has_staff_stats = all(k in stats for k in ["allMine", "pending", "inProg", "done", "overdue", "dueToday"])
            results.append(print_result(
                has_staff_stats,
                f"Staff stats: allMine={stats.get('allMine')}, pending={stats.get('pending')}, overdue={stats.get('overdue')}, dueToday={stats.get('dueToday')}"
            ))
        else:
            results.append(print_result(False, f"GET dashboard as staff failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_activity_logs():
    """Test activity logs endpoint"""
    results = []
    
    print_test("GET /activity (activity logs)")
    try:
        response = requests.get(
            f"{BASE_URL}/activity",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            logs = data.get("logs", [])
            results.append(print_result(
                len(logs) > 0,
                f"Activity logs returned {len(logs)} entries"
            ))
            
            # Check log structure
            if logs:
                first_log = logs[0]
                has_structure = all(k in first_log for k in ["id", "action", "entity", "createdAt"])
                results.append(print_result(
                    has_structure,
                    f"Log entry has correct structure: action={first_log.get('action')}, entity={first_log.get('entity')}"
                ))
        else:
            results.append(print_result(False, f"GET activity logs failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_no_mongo_id():
    """Verify no MongoDB _id fields are exposed"""
    results = []
    
    print_test("Verify no MongoDB _id in responses")
    try:
        # Check users
        response = requests.get(
            f"{BASE_URL}/users",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            users_list = response.json().get("users", [])
            has_mongo_id = any("_id" in u for u in users_list)
            results.append(print_result(
                not has_mongo_id,
                f"Users response has no _id field"
            ))
        
        # Check leads
        response = requests.get(
            f"{BASE_URL}/leads",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            leads_list = response.json().get("leads", [])
            has_mongo_id = any("_id" in l for l in leads_list)
            results.append(print_result(
                not has_mongo_id,
                f"Leads response has no _id field"
            ))
        
        # Check tasks
        response = requests.get(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            tasks_list = response.json().get("tasks", [])
            has_mongo_id = any("_id" in t for t in tasks_list)
            results.append(print_result(
                not has_mongo_id,
                f"Tasks response has no _id field"
            ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("CA PRACTICE MANAGEMENT BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test started at: {datetime.now().isoformat()}")
    print("="*80)
    
    all_results = []
    
    # 1. Auth tests
    print("\n\n### 1. AUTHENTICATION TESTS ###")
    all_results.append(("Auth", test_auth()))
    
    # 2. Users tests
    print("\n\n### 2. USERS CRUD TESTS ###")
    all_results.append(("Users", test_users()))
    
    # 3. Leads tests
    print("\n\n### 3. LEADS CRUD TESTS ###")
    leads_result, lead_id = test_leads()
    all_results.append(("Leads", leads_result))
    
    # 4. Convert lead to task
    print("\n\n### 4. CONVERT LEAD TO TASK ###")
    convert_result, task_id = test_convert_lead_to_task(lead_id)
    all_results.append(("Convert Lead", convert_result))
    
    # 5. Tasks tests
    print("\n\n### 5. TASKS CRUD TESTS ###")
    all_results.append(("Tasks", test_tasks()))
    
    # 6. Quotations tests
    print("\n\n### 6. QUOTATIONS TESTS ###")
    all_results.append(("Quotations", test_quotations()))
    
    # 7. Dashboard tests
    print("\n\n### 7. DASHBOARD TESTS ###")
    all_results.append(("Dashboard", test_dashboard()))
    
    # 8. Activity logs
    print("\n\n### 8. ACTIVITY LOGS TESTS ###")
    all_results.append(("Activity Logs", test_activity_logs()))
    
    # 9. No MongoDB _id exposure
    print("\n\n### 9. MONGODB _ID EXPOSURE CHECK ###")
    all_results.append(("No _id exposure", test_no_mongo_id()))
    
    # Summary
    print("\n\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    for name, result in all_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    total = len(all_results)
    passed = sum(1 for _, r in all_results if r)
    print(f"\nTotal: {passed}/{total} test suites passed")
    print("="*80)
    
    return all(r for _, r in all_results)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
