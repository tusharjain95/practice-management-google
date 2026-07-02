#!/usr/bin/env python3
"""
Comprehensive Backend Tests for Backup & Restore Endpoints
CA Practice Management System
"""

import requests
import json
import sys
from datetime import datetime

BASE_URL = "https://ca-crm-hub-1.preview.emergentagent.com/api"

# Test credentials
ADMIN_CREDS = {"email": "admin@ca.com", "password": "admin123"}
MANAGER_CREDS = {"email": "manager@ca.com", "password": "manager123"}
STAFF_CREDS = {"email": "staff@ca.com", "password": "staff123"}

def login(creds):
    """Login and return token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json=creds)
    if resp.status_code == 200:
        return resp.json().get("token")
    return None

def auth_headers(token):
    """Return authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def print_test(name):
    """Print test name"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_pass(msg):
    """Print pass message"""
    print(f"✅ PASS: {msg}")

def print_fail(msg):
    """Print fail message"""
    print(f"❌ FAIL: {msg}")

def test_backup_export_admin():
    """Test GET /api/backup/export as admin"""
    print_test("Backup Export - Admin Access")
    
    token = login(ADMIN_CREDS)
    if not token:
        print_fail("Failed to login as admin")
        return False
    
    headers = auth_headers(token)
    resp = requests.get(f"{BASE_URL}/backup/export", headers=headers)
    
    if resp.status_code != 200:
        print_fail(f"Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    # Check Content-Type
    content_type = resp.headers.get('Content-Type', '')
    if 'application/json' not in content_type:
        print_fail(f"Expected Content-Type: application/json, got {content_type}")
        return False
    print_pass(f"Content-Type is application/json")
    
    # Check Content-Disposition
    content_disp = resp.headers.get('Content-Disposition', '')
    if 'attachment' not in content_disp or 'ca-backup-' not in content_disp:
        print_fail(f"Expected Content-Disposition with attachment and ca-backup-, got {content_disp}")
        return False
    print_pass(f"Content-Disposition header correct: {content_disp}")
    
    # Parse JSON
    try:
        data = resp.json()
    except:
        print_fail("Response is not valid JSON")
        return False
    
    # Verify structure
    if 'meta' not in data or 'data' not in data:
        print_fail("Missing 'meta' or 'data' in response")
        return False
    print_pass("Response has 'meta' and 'data' sections")
    
    # Verify meta fields
    meta = data['meta']
    required_meta = ['appName', 'schemaVersion', 'exportedAt', 'exportedBy', 'dbName', 'includeLogs', 'includePasswords', 'counts']
    for field in required_meta:
        if field not in meta:
            print_fail(f"Missing '{field}' in meta")
            return False
    print_pass("All required meta fields present")
    
    if meta['appName'] != 'CA Practice Management':
        print_fail(f"Expected appName 'CA Practice Management', got {meta['appName']}")
        return False
    print_pass("appName is 'CA Practice Management'")
    
    # Verify data collections
    data_section = data['data']
    expected_collections = ['users', 'leads', 'tasks', 'clients', 'invoices', 'payments', 'quotations', 'compliances', 'settings', 'activity_logs']
    for coll in expected_collections:
        if coll not in data_section:
            print_fail(f"Missing collection '{coll}' in data")
            return False
    print_pass("All expected collections present in data")
    
    # Verify counts match array lengths
    counts = meta['counts']
    for coll in expected_collections:
        if coll not in counts:
            print_fail(f"Missing '{coll}' in meta.counts")
            return False
        expected_count = len(data_section[coll])
        actual_count = counts[coll]
        if expected_count != actual_count:
            print_fail(f"Count mismatch for {coll}: meta.counts={actual_count}, actual length={expected_count}")
            return False
    print_pass("All counts match array lengths")
    
    # Verify users have passwordHash (default includePasswords=true)
    users = data_section['users']
    if len(users) > 0:
        for user in users:
            if 'passwordHash' not in user:
                print_fail(f"User {user.get('email')} missing passwordHash")
                return False
        print_pass("All users have passwordHash field (includePasswords=true by default)")
    
    # Verify no _id fields
    for coll in expected_collections:
        for doc in data_section[coll]:
            if '_id' in doc:
                print_fail(f"Found _id in {coll} document")
                return False
    print_pass("No _id fields in any documents")
    
    # Verify includeLogs and includePasswords defaults
    if not meta['includeLogs']:
        print_fail("Expected includeLogs=true by default")
        return False
    if not meta['includePasswords']:
        print_fail("Expected includePasswords=true by default")
        return False
    print_pass("includeLogs and includePasswords are true by default")
    
    print_pass("✅ ALL BACKUP EXPORT ADMIN TESTS PASSED")
    return True, data  # Return data for later tests

def test_backup_export_query_params():
    """Test GET /api/backup/export with query params"""
    print_test("Backup Export - Query Parameters")
    
    token = login(ADMIN_CREDS)
    if not token:
        print_fail("Failed to login as admin")
        return False
    
    headers = auth_headers(token)
    
    # Test includeLogs=false
    resp = requests.get(f"{BASE_URL}/backup/export?includeLogs=false", headers=headers)
    if resp.status_code != 200:
        print_fail(f"includeLogs=false: Expected 200, got {resp.status_code}")
        return False
    
    data = resp.json()
    if 'activity_logs' in data['data']:
        print_fail("includeLogs=false: activity_logs should not be in data")
        return False
    if data['meta']['includeLogs'] != False:
        print_fail("includeLogs=false: meta.includeLogs should be false")
        return False
    print_pass("includeLogs=false: activity_logs excluded and meta.includeLogs=false")
    
    # Test includePasswords=false
    resp = requests.get(f"{BASE_URL}/backup/export?includePasswords=false", headers=headers)
    if resp.status_code != 200:
        print_fail(f"includePasswords=false: Expected 200, got {resp.status_code}")
        return False
    
    data = resp.json()
    users = data['data']['users']
    if len(users) > 0:
        for user in users:
            if 'passwordHash' in user:
                print_fail(f"includePasswords=false: User {user.get('email')} should not have passwordHash")
                return False
    if data['meta']['includePasswords'] != False:
        print_fail("includePasswords=false: meta.includePasswords should be false")
        return False
    print_pass("includePasswords=false: passwordHash stripped from users and meta.includePasswords=false")
    
    print_pass("✅ ALL QUERY PARAMS TESTS PASSED")
    return True

def test_backup_export_negative():
    """Test GET /api/backup/export negative cases"""
    print_test("Backup Export - Negative Cases")
    
    # Test without auth
    resp = requests.get(f"{BASE_URL}/backup/export")
    if resp.status_code != 401:
        print_fail(f"No auth: Expected 401, got {resp.status_code}")
        return False
    print_pass("No auth: Returns 401")
    
    # Test as manager
    token = login(MANAGER_CREDS)
    if not token:
        print_fail("Failed to login as manager")
        return False
    
    headers = auth_headers(token)
    resp = requests.get(f"{BASE_URL}/backup/export", headers=headers)
    if resp.status_code != 403:
        print_fail(f"Manager: Expected 403, got {resp.status_code}")
        return False
    
    error_msg = resp.json().get('error', '')
    if 'admin' not in error_msg.lower():
        print_fail(f"Manager: Error message should mention 'admin', got: {error_msg}")
        return False
    print_pass(f"Manager: Returns 403 with admin-only error message")
    
    # Test as staff
    token = login(STAFF_CREDS)
    if not token:
        print_fail("Failed to login as staff")
        return False
    
    headers = auth_headers(token)
    resp = requests.get(f"{BASE_URL}/backup/export", headers=headers)
    if resp.status_code != 403:
        print_fail(f"Staff: Expected 403, got {resp.status_code}")
        return False
    print_pass("Staff: Returns 403")
    
    print_pass("✅ ALL NEGATIVE TESTS PASSED")
    return True

def test_backup_import_validation():
    """Test POST /api/backup/import validation"""
    print_test("Backup Import - Validation")
    
    token = login(ADMIN_CREDS)
    if not token:
        print_fail("Failed to login as admin")
        return False
    
    headers = auth_headers(token)
    
    # Test with empty body
    resp = requests.post(f"{BASE_URL}/backup/import", json={}, headers=headers)
    if resp.status_code != 400:
        print_fail(f"Empty body: Expected 400, got {resp.status_code}")
        return False
    
    error_msg = resp.json().get('error', '')
    if 'missing data section' not in error_msg.lower():
        print_fail(f"Empty body: Error should mention 'missing data section', got: {error_msg}")
        return False
    print_pass("Empty body: Returns 400 with 'missing data section' error")
    
    # Test with empty data
    resp = requests.post(f"{BASE_URL}/backup/import", 
                        json={"mode": "merge", "payload": {"data": {}}}, 
                        headers=headers)
    if resp.status_code != 200:
        print_fail(f"Empty data: Expected 200, got {resp.status_code}: {resp.text}")
        return False
    print_pass("Empty data: Returns 200 (empty arrays are valid)")
    
    # Test with wrong appName
    resp = requests.post(f"{BASE_URL}/backup/import",
                        json={"mode": "merge", "payload": {"meta": {"appName": "Wrong App"}, "data": {}}},
                        headers=headers)
    if resp.status_code != 400:
        print_fail(f"Wrong appName: Expected 400, got {resp.status_code}")
        return False
    
    error_msg = resp.json().get('error', '')
    if 'different app' not in error_msg.lower():
        print_fail(f"Wrong appName: Error should mention 'different app', got: {error_msg}")
        return False
    print_pass("Wrong appName: Returns 400 with 'different app' error")
    
    print_pass("✅ ALL VALIDATION TESTS PASSED")
    return True

def test_backup_import_roles():
    """Test POST /api/backup/import role-based access"""
    print_test("Backup Import - Role-Based Access")
    
    # Test without auth
    resp = requests.post(f"{BASE_URL}/backup/import", json={})
    if resp.status_code != 401:
        print_fail(f"No auth: Expected 401, got {resp.status_code}")
        return False
    print_pass("No auth: Returns 401")
    
    # Test as manager
    token = login(MANAGER_CREDS)
    if not token:
        print_fail("Failed to login as manager")
        return False
    
    headers = auth_headers(token)
    resp = requests.post(f"{BASE_URL}/backup/import", 
                        json={"mode": "merge", "payload": {"data": {}}}, 
                        headers=headers)
    if resp.status_code != 403:
        print_fail(f"Manager: Expected 403, got {resp.status_code}")
        return False
    print_pass("Manager: Returns 403")
    
    # Test as staff
    token = login(STAFF_CREDS)
    if not token:
        print_fail("Failed to login as staff")
        return False
    
    headers = auth_headers(token)
    resp = requests.post(f"{BASE_URL}/backup/import",
                        json={"mode": "merge", "payload": {"data": {}}},
                        headers=headers)
    if resp.status_code != 403:
        print_fail(f"Staff: Expected 403, got {resp.status_code}")
        return False
    print_pass("Staff: Returns 403")
    
    print_pass("✅ ALL ROLE-BASED ACCESS TESTS PASSED")
    return True

def test_backup_import_merge_idempotency(export_data):
    """Test POST /api/backup/import merge mode idempotency"""
    print_test("Backup Import - Merge Mode Idempotency")
    
    token = login(ADMIN_CREDS)
    if not token:
        print_fail("Failed to login as admin")
        return False
    
    headers = auth_headers(token)
    
    # First import
    resp = requests.post(f"{BASE_URL}/backup/import",
                        json={"mode": "merge", "payload": export_data},
                        headers=headers)
    if resp.status_code != 200:
        print_fail(f"First import: Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    result1 = resp.json()
    if not result1.get('ok'):
        print_fail("First import: ok should be true")
        return False
    if result1.get('mode') != 'merge':
        print_fail(f"First import: mode should be 'merge', got {result1.get('mode')}")
        return False
    
    summary1 = result1.get('summary', {})
    print_pass(f"First import: {json.dumps(summary1, indent=2)}")
    
    # Verify that most records were updated (since they already exist)
    # At least users should have been updated
    if 'users' in summary1:
        users_summary = summary1['users']
        if users_summary['total'] > 0:
            # In merge mode, existing records should be updated
            print_pass(f"First import users: total={users_summary['total']}, inserted={users_summary['inserted']}, updated={users_summary['updated']}")
    
    # Second import (idempotency test)
    resp = requests.post(f"{BASE_URL}/backup/import",
                        json={"mode": "merge", "payload": export_data},
                        headers=headers)
    if resp.status_code != 200:
        print_fail(f"Second import: Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    result2 = resp.json()
    summary2 = result2.get('summary', {})
    print_pass(f"Second import: {json.dumps(summary2, indent=2)}")
    
    # Verify idempotency: second import should have 0 inserts, all updates
    for coll, stats in summary2.items():
        if stats['total'] > 0:
            if stats['inserted'] != 0:
                print_fail(f"Second import {coll}: Expected 0 inserts (idempotency), got {stats['inserted']}")
                return False
            if stats['updated'] != stats['total']:
                print_fail(f"Second import {coll}: Expected all records updated, got updated={stats['updated']}, total={stats['total']}")
                return False
    print_pass("Second import: Idempotency verified (0 inserts, all updates)")
    
    # Verify data still accessible
    resp = requests.get(f"{BASE_URL}/users", headers=headers)
    if resp.status_code != 200:
        print_fail(f"GET /users after import: Expected 200, got {resp.status_code}")
        return False
    print_pass("GET /users still works after import")
    
    resp = requests.get(f"{BASE_URL}/leads", headers=headers)
    if resp.status_code != 200:
        print_fail(f"GET /leads after import: Expected 200, got {resp.status_code}")
        return False
    print_pass("GET /leads still works after import")
    
    resp = requests.get(f"{BASE_URL}/tasks", headers=headers)
    if resp.status_code != 200:
        print_fail(f"GET /tasks after import: Expected 200, got {resp.status_code}")
        return False
    print_pass("GET /tasks still works after import")
    
    print_pass("✅ ALL MERGE MODE IDEMPOTENCY TESTS PASSED")
    return True

def test_backup_import_replace_mode():
    """Test POST /api/backup/import replace mode with self-preservation"""
    print_test("Backup Import - Replace Mode + Self-Preservation")
    
    token = login(ADMIN_CREDS)
    if not token:
        print_fail("Failed to login as admin")
        return False
    
    headers = auth_headers(token)
    
    # Get admin user info
    resp = requests.get(f"{BASE_URL}/users", headers=headers)
    if resp.status_code != 200:
        print_fail(f"GET /users: Expected 200, got {resp.status_code}")
        return False
    
    users = resp.json()
    admin_user = next((u for u in users if u['email'] == 'admin@ca.com'), None)
    if not admin_user:
        print_fail("Admin user not found")
        return False
    admin_id = admin_user['id']
    print_pass(f"Admin user ID: {admin_id}")
    
    # Create a test lead
    test_lead = {
        "name": "Test Lead Before Replace",
        "phone": "1234567890",
        "email": "testlead@test.com",
        "status": "New",
        "serviceType": "Tax",
        "assignedTo": admin_id
    }
    resp = requests.post(f"{BASE_URL}/leads", json=test_lead, headers=headers)
    if resp.status_code != 201:
        print_fail(f"Create test lead: Expected 201, got {resp.status_code}")
        return False
    print_pass("Created test lead")
    
    # Build synthetic payload with only one lead
    synthetic_payload = {
        "meta": {"appName": "CA Practice Management"},
        "data": {
            "leads": [{
                "id": "test-restored-lead-1",
                "name": "Restored Lead After Replace",
                "phone": "9999999999",
                "email": "restored@test.com",
                "status": "New",
                "serviceType": "Audit",
                "assignedTo": admin_id,
                "createdAt": "2026-01-01T00:00:00Z"
            }]
        }
    }
    
    # Import with replace mode, only leads collection
    resp = requests.post(f"{BASE_URL}/backup/import",
                        json={"mode": "replace", "payload": synthetic_payload, "collections": ["leads"]},
                        headers=headers)
    if resp.status_code != 200:
        print_fail(f"Replace import: Expected 200, got {resp.status_code}: {resp.text}")
        return False
    
    result = resp.json()
    print_pass(f"Replace import result: {json.dumps(result, indent=2)}")
    
    # Verify only the restored lead exists
    resp = requests.get(f"{BASE_URL}/leads", headers=headers)
    if resp.status_code != 200:
        print_fail(f"GET /leads after replace: Expected 200, got {resp.status_code}")
        return False
    
    leads = resp.json()
    if len(leads) != 1:
        print_fail(f"Expected 1 lead after replace, got {len(leads)}")
        return False
    
    if leads[0]['name'] != "Restored Lead After Replace":
        print_fail(f"Expected restored lead, got {leads[0]['name']}")
        return False
    print_pass("Replace mode: Only restored lead exists (old lead wiped)")
    
    # Verify admin can still login (self-preservation)
    login_resp = requests.post(f"{BASE_URL}/auth/login", json=ADMIN_CREDS)
    if login_resp.status_code != 200:
        print_fail(f"Admin login after replace: Expected 200, got {login_resp.status_code}")
        return False
    print_pass("Admin can still login after replace (self-preservation works)")
    
    # Test users replace with self-preservation
    # Build payload with a different user (not admin)
    synthetic_user_payload = {
        "meta": {"appName": "CA Practice Management"},
        "data": {
            "users": [{
                "id": "ghost-user-id",
                "email": "ghost@x.com",
                "name": "Ghost User",
                "role": "staff",
                "passwordHash": "$2a$10$deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdead",
                "active": True,
                "createdAt": "2026-01-01T00:00:00Z"
            }]
        }
    }
    
    # Import with replace mode, only users collection
    resp = requests.post(f"{BASE_URL}/backup/import",
                        json={"mode": "replace", "payload": synthetic_user_payload, "collections": ["users"]},
                        headers=headers)
    if resp.status_code != 200:
        print_fail(f"Replace users import: Expected 200, got {resp.status_code}: {resp.text}")
        return False
    print_pass("Replace users import successful")
    
    # Verify admin can still login (admin preserved because not in backup)
    login_resp = requests.post(f"{BASE_URL}/auth/login", json=ADMIN_CREDS)
    if login_resp.status_code != 200:
        print_fail(f"Admin login after users replace: Expected 200, got {login_resp.status_code}")
        return False
    
    new_token = login_resp.json().get('token')
    new_headers = auth_headers(new_token)
    print_pass("Admin still exists and can login after users replace (self-preservation)")
    
    # Verify ghost user exists
    resp = requests.get(f"{BASE_URL}/users", headers=new_headers)
    if resp.status_code != 200:
        print_fail(f"GET /users after replace: Expected 200, got {resp.status_code}")
        return False
    
    users = resp.json()
    ghost_user = next((u for u in users if u['email'] == 'ghost@x.com'), None)
    if not ghost_user:
        print_fail("Ghost user not found after replace")
        return False
    print_pass("Ghost user exists after replace")
    
    # Verify admin still exists
    admin_user = next((u for u in users if u['email'] == 'admin@ca.com'), None)
    if not admin_user:
        print_fail("Admin user not found after replace (self-preservation failed)")
        return False
    print_pass("Admin user preserved after replace")
    
    print_pass("✅ ALL REPLACE MODE + SELF-PRESERVATION TESTS PASSED")
    return True

def test_backup_import_user_password_handling():
    """Test POST /api/backup/import user passwordHash handling"""
    print_test("Backup Import - User PasswordHash Handling")
    
    token = login(ADMIN_CREDS)
    if not token:
        print_fail("Failed to login as admin")
        return False
    
    headers = auth_headers(token)
    
    # Build payload with user without passwordHash
    payload = {
        "meta": {"appName": "CA Practice Management"},
        "data": {
            "users": [{
                "id": "nopw-user-id",
                "email": "nopwuser@test.com",
                "name": "No Password User",
                "role": "staff",
                "active": True,
                "createdAt": "2026-01-01T00:00:00Z"
            }]
        }
    }
    
    # Import with merge mode
    resp = requests.post(f"{BASE_URL}/backup/import",
                        json={"mode": "merge", "payload": payload, "collections": ["users"]},
                        headers=headers)
    if resp.status_code != 200:
        print_fail(f"Import user without passwordHash: Expected 200, got {resp.status_code}: {resp.text}")
        return False
    print_pass("Import user without passwordHash successful")
    
    # Try to login as this user (should fail because passwordHash was set to random)
    login_resp = requests.post(f"{BASE_URL}/auth/login", 
                              json={"email": "nopwuser@test.com", "password": "anything"})
    if login_resp.status_code != 401:
        print_fail(f"Login as nopwuser: Expected 401, got {login_resp.status_code}")
        return False
    print_pass("Login as user without passwordHash fails (random hash assigned)")
    
    print_pass("✅ ALL USER PASSWORDHASH HANDLING TESTS PASSED")
    return True

def test_activity_log():
    """Test activity log for backup operations"""
    print_test("Activity Log - Backup Operations")
    
    token = login(ADMIN_CREDS)
    if not token:
        print_fail("Failed to login as admin")
        return False
    
    headers = auth_headers(token)
    
    # Get activity logs
    resp = requests.get(f"{BASE_URL}/activity", headers=headers)
    if resp.status_code != 200:
        print_fail(f"GET /activity: Expected 200, got {resp.status_code}")
        return False
    
    logs = resp.json()
    
    # Find export and import logs
    export_logs = [log for log in logs if log.get('action') == 'export' and log.get('entity') == 'backup']
    import_logs = [log for log in logs if log.get('action') == 'import' and log.get('entity') == 'backup']
    
    if len(export_logs) == 0:
        print_fail("No export logs found")
        return False
    print_pass(f"Found {len(export_logs)} export log(s)")
    
    if len(import_logs) == 0:
        print_fail("No import logs found")
        return False
    print_pass(f"Found {len(import_logs)} import log(s)")
    
    print_pass("✅ ALL ACTIVITY LOG TESTS PASSED")
    return True

def test_tasks_smoke_test():
    """Smoke test for tasks POST/GET"""
    print_test("Smoke Test - Tasks POST/GET")
    
    token = login(ADMIN_CREDS)
    if not token:
        print_fail("Failed to login as admin")
        return False
    
    headers = auth_headers(token)
    
    # Get admin user ID
    resp = requests.get(f"{BASE_URL}/users", headers=headers)
    if resp.status_code != 200:
        print_fail(f"GET /users: Expected 200, got {resp.status_code}")
        return False
    
    users = resp.json()
    admin_user = next((u for u in users if u['email'] == 'admin@ca.com'), None)
    if not admin_user:
        print_fail("Admin user not found")
        return False
    admin_id = admin_user['id']
    
    # Create a task
    task_data = {
        "title": "Smoke Test Task",
        "description": "Testing task creation after backup/restore implementation",
        "category": "Tax",
        "priority": "High",
        "status": "Pending",
        "assignedTo": admin_id,
        "dueDate": "2026-07-01"
    }
    
    resp = requests.post(f"{BASE_URL}/tasks", json=task_data, headers=headers)
    if resp.status_code != 201:
        print_fail(f"POST /tasks: Expected 201, got {resp.status_code}: {resp.text}")
        return False
    
    created_task = resp.json()
    task_id = created_task.get('id')
    print_pass(f"Created task with ID: {task_id}")
    
    # Get tasks
    resp = requests.get(f"{BASE_URL}/tasks", headers=headers)
    if resp.status_code != 200:
        print_fail(f"GET /tasks: Expected 200, got {resp.status_code}")
        return False
    
    tasks = resp.json()
    found_task = next((t for t in tasks if t['id'] == task_id), None)
    if not found_task:
        print_fail("Created task not found in GET /tasks")
        return False
    
    if found_task['title'] != "Smoke Test Task":
        print_fail(f"Task title mismatch: expected 'Smoke Test Task', got {found_task['title']}")
        return False
    
    print_pass("Task creation and retrieval working correctly")
    print_pass("✅ TASKS SMOKE TEST PASSED")
    return True

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BACKUP & RESTORE COMPREHENSIVE BACKEND TESTS")
    print("CA Practice Management System")
    print("="*80)
    
    results = []
    export_data = None
    
    # Test 1: Backup export as admin
    try:
        result = test_backup_export_admin()
        if isinstance(result, tuple):
            success, export_data = result
            results.append(("Backup Export - Admin", success))
        else:
            results.append(("Backup Export - Admin", result))
    except Exception as e:
        print_fail(f"Exception in test_backup_export_admin: {e}")
        results.append(("Backup Export - Admin", False))
    
    # Test 2: Backup export query params
    try:
        results.append(("Backup Export - Query Params", test_backup_export_query_params()))
    except Exception as e:
        print_fail(f"Exception in test_backup_export_query_params: {e}")
        results.append(("Backup Export - Query Params", False))
    
    # Test 3: Backup export negative cases
    try:
        results.append(("Backup Export - Negative Cases", test_backup_export_negative()))
    except Exception as e:
        print_fail(f"Exception in test_backup_export_negative: {e}")
        results.append(("Backup Export - Negative Cases", False))
    
    # Test 4: Backup import validation
    try:
        results.append(("Backup Import - Validation", test_backup_import_validation()))
    except Exception as e:
        print_fail(f"Exception in test_backup_import_validation: {e}")
        results.append(("Backup Import - Validation", False))
    
    # Test 5: Backup import roles
    try:
        results.append(("Backup Import - Roles", test_backup_import_roles()))
    except Exception as e:
        print_fail(f"Exception in test_backup_import_roles: {e}")
        results.append(("Backup Import - Roles", False))
    
    # Test 6: Backup import merge idempotency (requires export_data)
    if export_data:
        try:
            results.append(("Backup Import - Merge Idempotency", test_backup_import_merge_idempotency(export_data)))
        except Exception as e:
            print_fail(f"Exception in test_backup_import_merge_idempotency: {e}")
            results.append(("Backup Import - Merge Idempotency", False))
    else:
        print_fail("Skipping merge idempotency test (no export data)")
        results.append(("Backup Import - Merge Idempotency", False))
    
    # Test 7: Backup import replace mode
    try:
        results.append(("Backup Import - Replace Mode", test_backup_import_replace_mode()))
    except Exception as e:
        print_fail(f"Exception in test_backup_import_replace_mode: {e}")
        results.append(("Backup Import - Replace Mode", False))
    
    # Test 8: User passwordHash handling
    try:
        results.append(("Backup Import - PasswordHash", test_backup_import_user_password_handling()))
    except Exception as e:
        print_fail(f"Exception in test_backup_import_user_password_handling: {e}")
        results.append(("Backup Import - PasswordHash", False))
    
    # Test 9: Activity log
    try:
        results.append(("Activity Log", test_activity_log()))
    except Exception as e:
        print_fail(f"Exception in test_activity_log: {e}")
        results.append(("Activity Log", False))
    
    # Test 10: Tasks smoke test
    try:
        results.append(("Tasks Smoke Test", test_tasks_smoke_test()))
    except Exception as e:
        print_fail(f"Exception in test_tasks_smoke_test: {e}")
        results.append(("Tasks Smoke Test", False))
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed} passed, {failed} failed out of {len(results)} tests")
    print("="*80)
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
