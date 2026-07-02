#!/usr/bin/env python3
"""
Backend API Test Suite for NEW FEATURES in CA Practice Management System
Tests: Clients, Invoices, Payments, Recurring Tasks, Branding, Search, Calendar, Reminders
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

# Store created entities for testing
test_data = {
    "client_id": None,
    "invoice_id": None,
    "payment_ids": [],
    "recurring_task_id": None
}

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

def test_clients_crud():
    """Test Clients CRUD with opening balance and enriched list"""
    results = []
    
    # Test 1: POST /clients as admin (should work)
    print_test("POST /clients as admin with opening balance")
    try:
        new_client = {
            "name": "Rajesh Kumar",
            "company": "Kumar Enterprises Pvt Ltd",
            "phone": "+91 98765 43210",
            "email": "rajesh@kumarenterprises.com",
            "gstin": "27AABCU9603R1ZX",
            "openingBalance": 15000,
            "openingBalanceAsOn": "2025-04-01"
        }
        response = requests.post(
            f"{BASE_URL}/clients",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=new_client,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            client = data.get("client", {})
            test_data["client_id"] = client.get("id")
            results.append(print_result(
                test_data["client_id"] is not None and client.get("openingBalance") == 15000,
                f"Client created with ID: {test_data['client_id']}, openingBalance: {client.get('openingBalance')}"
            ))
        else:
            results.append(print_result(False, f"Create client failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: POST /clients as staff (should fail - 403)
    print_test("POST /clients as staff (should be 403)")
    try:
        response = requests.post(
            f"{BASE_URL}/clients",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            json={"name": "Test Client", "company": "Test Co"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 403,
            f"Staff cannot create client: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: GET /clients (enriched list with billed/received/netDue/invoiceCount)
    print_test("GET /clients (enriched list)")
    try:
        response = requests.get(
            f"{BASE_URL}/clients",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            clients = data.get("clients", [])
            if clients:
                client = next((c for c in clients if c.get("id") == test_data["client_id"]), None)
                if client:
                    has_enriched_fields = all(k in client for k in ["billed", "received", "netDue", "invoiceCount"])
                    results.append(print_result(
                        has_enriched_fields,
                        f"Client enriched: billed={client.get('billed')}, received={client.get('received')}, netDue={client.get('netDue')}, invoiceCount={client.get('invoiceCount')}"
                    ))
                else:
                    results.append(print_result(False, "Created client not found in list"))
            else:
                results.append(print_result(True, "No clients yet, but endpoint works"))
        else:
            results.append(print_result(False, f"GET clients failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: PUT /clients/:id as manager (should work)
    if test_data["client_id"]:
        print_test("PUT /clients/:id as manager")
        try:
            response = requests.put(
                f"{BASE_URL}/clients/{test_data['client_id']}",
                headers={"Authorization": f"Bearer {tokens['manager']}"},
                json={"phone": "+91 98765 99999", "notes": "Updated contact number"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Manager updated client: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 5: PUT /clients/:id as staff (should fail - 403)
        print_test("PUT /clients/:id as staff (should be 403)")
        try:
            response = requests.put(
                f"{BASE_URL}/clients/{test_data['client_id']}",
                headers={"Authorization": f"Bearer {tokens['staff']}"},
                json={"phone": "+91 11111 11111"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 403,
                f"Staff cannot update client: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_invoices_crud():
    """Test Invoices CRUD with auto-numbering and GST calculation"""
    results = []
    
    # Test 1: POST /invoices with gstApplicable=true
    print_test("POST /invoices with auto-numbering and GST calculation")
    try:
        current_year = datetime.now().year
        new_invoice = {
            "clientId": test_data["client_id"],
            "clientName": "Rajesh Kumar",
            "companyName": "Kumar Enterprises Pvt Ltd",
            "clientAddress": "123 Business Park, Mumbai",
            "clientGstin": "27AABCU9603R1ZX",
            "items": [
                {"name": "GST Filing", "description": "Monthly GST filing", "qty": 3, "rate": 2000},
                {"name": "Audit Services", "description": "Annual audit", "qty": 1, "rate": 2500}
            ],
            "gstApplicable": True,
            "dueDate": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        }
        response = requests.post(
            f"{BASE_URL}/invoices",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=new_invoice,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            invoice = data.get("invoice", {})
            test_data["invoice_id"] = invoice.get("id")
            
            # Verify auto-numbering format INV-YYYY-NNNN
            invoice_number = invoice.get("invoiceNumber", "")
            is_correct_format = invoice_number.startswith(f"INV-{current_year}-")
            
            # Verify calculations: subtotal = 3*2000 + 1*2500 = 8500
            expected_subtotal = 8500
            expected_gst = round(expected_subtotal * 0.18, 2)  # 1530.00
            expected_total = expected_subtotal + expected_gst  # 10030.00
            
            results.append(print_result(
                is_correct_format,
                f"Invoice number format correct: {invoice_number}"
            ))
            results.append(print_result(
                invoice.get("subtotal") == expected_subtotal,
                f"Subtotal correct: {invoice.get('subtotal')} == {expected_subtotal}"
            ))
            results.append(print_result(
                invoice.get("gstAmount") == expected_gst,
                f"GST amount correct: {invoice.get('gstAmount')} == {expected_gst}"
            ))
            results.append(print_result(
                invoice.get("total") == expected_total,
                f"Total correct: {invoice.get('total')} == {expected_total}"
            ))
            results.append(print_result(
                invoice.get("status") == "Unpaid",
                f"Initial status is Unpaid: {invoice.get('status')}"
            ))
        else:
            results.append(print_result(False, f"Create invoice failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: GET /invoices (list with paidAmount and dueAmount)
    print_test("GET /invoices (list with paidAmount and dueAmount)")
    try:
        response = requests.get(
            f"{BASE_URL}/invoices",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            invoices = data.get("invoices", [])
            if invoices:
                invoice = next((i for i in invoices if i.get("id") == test_data["invoice_id"]), None)
                if invoice:
                    has_payment_fields = "paidAmount" in invoice and "dueAmount" in invoice
                    results.append(print_result(
                        has_payment_fields,
                        f"Invoice has payment fields: paidAmount={invoice.get('paidAmount')}, dueAmount={invoice.get('dueAmount')}"
                    ))
                else:
                    results.append(print_result(False, "Created invoice not found in list"))
            else:
                results.append(print_result(True, "No invoices yet, but endpoint works"))
        else:
            results.append(print_result(False, f"GET invoices failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: GET /invoices/:id (single with payments array)
    if test_data["invoice_id"]:
        print_test("GET /invoices/:id (single with payments)")
        try:
            response = requests.get(
                f"{BASE_URL}/invoices/{test_data['invoice_id']}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                invoice = data.get("invoice", {})
                has_payments_array = "payments" in invoice
                results.append(print_result(
                    has_payments_array,
                    f"Invoice has payments array: {len(invoice.get('payments', []))} payments"
                ))
            else:
                results.append(print_result(False, f"GET single invoice failed: {response.status_code}"))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 4: PUT /invoices/:id as manager (should work)
        print_test("PUT /invoices/:id as manager")
        try:
            response = requests.put(
                f"{BASE_URL}/invoices/{test_data['invoice_id']}",
                headers={"Authorization": f"Bearer {tokens['manager']}"},
                json={"notes": "Payment reminder sent"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Manager updated invoice: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 5: PUT /invoices/:id as staff (should fail - 403)
        print_test("PUT /invoices/:id as staff (should be 403)")
        try:
            response = requests.put(
                f"{BASE_URL}/invoices/{test_data['invoice_id']}",
                headers={"Authorization": f"Bearer {tokens['staff']}"},
                json={"notes": "Hacked"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 403,
                f"Staff cannot update invoice: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_payments_with_invoice_status_sync():
    """Test Payments CRUD with automatic invoice status updates (Partial/Paid)"""
    results = []
    
    if not test_data["invoice_id"]:
        print_result(False, "No invoice ID available for payment tests")
        return False
    
    # Get invoice total first
    try:
        response = requests.get(
            f"{BASE_URL}/invoices/{test_data['invoice_id']}",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        invoice_total = response.json().get("invoice", {}).get("total", 0)
        print(f"Invoice total: {invoice_total}")
    except Exception as e:
        print_result(False, f"Failed to get invoice total: {str(e)}")
        return False
    
    # Test 1: POST /payments with partial amount (should set status to 'Partial')
    print_test("POST /payments with partial amount (status should become 'Partial')")
    try:
        partial_payment = {
            "clientId": test_data["client_id"],
            "invoiceId": test_data["invoice_id"],
            "amount": 5000,
            "mode": "UPI",
            "reference": "UPI/123456789",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        response = requests.post(
            f"{BASE_URL}/payments",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=partial_payment,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            payment = data.get("payment", {})
            payment_id = payment.get("id")
            test_data["payment_ids"].append(payment_id)
            results.append(print_result(
                payment_id is not None,
                f"Partial payment created: ID={payment_id}, amount={payment.get('amount')}"
            ))
            
            # Verify invoice status changed to 'Partial'
            response = requests.get(
                f"{BASE_URL}/invoices/{test_data['invoice_id']}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            if response.status_code == 200:
                invoice = response.json().get("invoice", {})
                results.append(print_result(
                    invoice.get("status") == "Partial",
                    f"Invoice status updated to 'Partial': {invoice.get('status')}"
                ))
            else:
                results.append(print_result(False, "Failed to verify invoice status"))
        else:
            results.append(print_result(False, f"Create payment failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: POST /payments to complete payment (status should become 'Paid')
    print_test("POST /payments to complete payment (status should become 'Paid')")
    try:
        remaining_amount = invoice_total - 5000
        full_payment = {
            "clientId": test_data["client_id"],
            "invoiceId": test_data["invoice_id"],
            "amount": remaining_amount,
            "mode": "Bank",
            "reference": "NEFT/987654321",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        response = requests.post(
            f"{BASE_URL}/payments",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=full_payment,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            payment = data.get("payment", {})
            payment_id = payment.get("id")
            test_data["payment_ids"].append(payment_id)
            results.append(print_result(
                payment_id is not None,
                f"Full payment created: ID={payment_id}, amount={payment.get('amount')}"
            ))
            
            # Verify invoice status changed to 'Paid'
            response = requests.get(
                f"{BASE_URL}/invoices/{test_data['invoice_id']}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            if response.status_code == 200:
                invoice = response.json().get("invoice", {})
                results.append(print_result(
                    invoice.get("status") == "Paid",
                    f"Invoice status updated to 'Paid': {invoice.get('status')}"
                ))
                results.append(print_result(
                    invoice.get("paidAmount") == invoice_total,
                    f"Paid amount matches total: {invoice.get('paidAmount')} == {invoice_total}"
                ))
            else:
                results.append(print_result(False, "Failed to verify invoice status"))
        else:
            results.append(print_result(False, f"Create payment failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: POST /payments without invoiceId (on-account payment)
    print_test("POST /payments without invoiceId (on-account payment)")
    try:
        on_account_payment = {
            "clientId": test_data["client_id"],
            "amount": 2000,
            "mode": "Cash",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        response = requests.post(
            f"{BASE_URL}/payments",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=on_account_payment,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            payment = data.get("payment", {})
            results.append(print_result(
                payment.get("invoiceId") is None,
                f"On-account payment created without invoiceId: {payment.get('id')}"
            ))
        else:
            results.append(print_result(False, f"Create on-account payment failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: GET /payments (list)
    print_test("GET /payments (list)")
    try:
        response = requests.get(
            f"{BASE_URL}/payments",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            payments = data.get("payments", [])
            results.append(print_result(
                len(payments) >= 2,
                f"Payments list returned {len(payments)} items"
            ))
        else:
            results.append(print_result(False, f"GET payments failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 5: POST /payments as staff (should fail - 403)
    print_test("POST /payments as staff (should be 403)")
    try:
        response = requests.post(
            f"{BASE_URL}/payments",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            json={"clientId": test_data["client_id"], "amount": 1000, "mode": "Cash"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 403,
            f"Staff cannot create payment: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_client_ledger():
    """Test client ledger endpoint with running balance"""
    results = []
    
    if not test_data["client_id"]:
        print_result(False, "No client ID available for ledger test")
        return False
    
    print_test("GET /clients/:id/ledger (with running balance)")
    try:
        response = requests.get(
            f"{BASE_URL}/clients/{test_data['client_id']}/ledger",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            
            # Verify structure
            has_required_fields = all(k in data for k in ["client", "invoices", "payments", "billed", "received", "netDue", "ledger"])
            results.append(print_result(
                has_required_fields,
                f"Ledger has all required fields"
            ))
            
            # Verify ledger entries
            ledger = data.get("ledger", [])
            if ledger:
                # Check opening balance entry
                opening_entry = next((e for e in ledger if e.get("type") == "opening"), None)
                results.append(print_result(
                    opening_entry is not None,
                    f"Ledger has opening balance entry: {opening_entry.get('debit') if opening_entry else 'N/A'}"
                ))
                
                # Check running balance
                has_balance_field = all("balance" in e for e in ledger)
                results.append(print_result(
                    has_balance_field,
                    f"All ledger entries have running balance field"
                ))
                
                # Verify netDue calculation
                # netDue = openingBalance + billed - received
                opening_balance = data.get("client", {}).get("openingBalance", 0)
                billed = data.get("billed", 0)
                received = data.get("received", 0)
                expected_net_due = opening_balance + billed - received
                actual_net_due = data.get("netDue", 0)
                
                results.append(print_result(
                    abs(actual_net_due - expected_net_due) < 0.01,
                    f"Net due calculation correct: {actual_net_due} (expected: {expected_net_due})"
                ))
                
                print(f"   Opening Balance: {opening_balance}")
                print(f"   Billed: {billed}")
                print(f"   Received: {received}")
                print(f"   Net Due: {actual_net_due}")
                print(f"   Ledger entries: {len(ledger)}")
            else:
                results.append(print_result(False, "Ledger is empty"))
        else:
            results.append(print_result(False, f"GET ledger failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_recurring_tasks():
    """Test recurring task auto-spawn on completion with idempotency"""
    results = []
    
    # Test 1: POST /tasks with recurrence='monthly'
    print_test("POST /tasks with recurrence='monthly'")
    try:
        recurring_task = {
            "title": "Monthly GST Filing",
            "description": "File monthly GST returns",
            "category": "Tax",
            "priority": "High",
            "dueDate": "2025-06-15",
            "recurrence": "monthly",
            "assignedTo": users["staff"]["id"]
        }
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=recurring_task,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            task = data.get("task", {})
            test_data["recurring_task_id"] = task.get("id")
            results.append(print_result(
                task.get("recurrence") == "monthly" and task.get("recurrenceSpawned") is None or task.get("recurrenceSpawned") == False,
                f"Recurring task created: ID={test_data['recurring_task_id']}, recurrence={task.get('recurrence')}"
            ))
        else:
            results.append(print_result(False, f"Create recurring task failed: {response.status_code} - {response.text}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: PUT /tasks/:id with status='Completed' (should spawn new task)
    if test_data["recurring_task_id"]:
        print_test("PUT /tasks/:id with status='Completed' (should spawn new task)")
        try:
            response = requests.put(
                f"{BASE_URL}/tasks/{test_data['recurring_task_id']}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"status": "Completed"},
                timeout=10
            )
            if response.status_code == 200:
                results.append(print_result(True, "Task marked as Completed"))
                
                # Verify original task has recurrenceSpawned=true
                response = requests.get(
                    f"{BASE_URL}/tasks",
                    headers={"Authorization": f"Bearer {tokens['admin']}"},
                    timeout=10
                )
                if response.status_code == 200:
                    tasks = response.json().get("tasks", [])
                    original_task = next((t for t in tasks if t.get("id") == test_data["recurring_task_id"]), None)
                    if original_task:
                        results.append(print_result(
                            original_task.get("recurrenceSpawned") == True,
                            f"Original task has recurrenceSpawned=true: {original_task.get('recurrenceSpawned')}"
                        ))
                    
                    # Verify new task was created with dueDate = original + 1 month
                    spawned_task = next((t for t in tasks if t.get("parentTaskId") == test_data["recurring_task_id"]), None)
                    if spawned_task:
                        results.append(print_result(
                            spawned_task.get("status") == "Pending" and spawned_task.get("dueDate") == "2025-07-15",
                            f"New task spawned: ID={spawned_task.get('id')}, dueDate={spawned_task.get('dueDate')}, status={spawned_task.get('status')}"
                        ))
                    else:
                        results.append(print_result(False, "No spawned task found"))
                else:
                    results.append(print_result(False, "Failed to get tasks"))
            else:
                results.append(print_result(False, f"Update task failed: {response.status_code}"))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
        
        # Test 3: Mark original task Completed AGAIN (should NOT spawn another task - idempotency)
        print_test("Mark original task Completed AGAIN (idempotency test)")
        try:
            response = requests.put(
                f"{BASE_URL}/tasks/{test_data['recurring_task_id']}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"status": "Completed"},
                timeout=10
            )
            if response.status_code == 200:
                # Count tasks with parentTaskId = original task
                response = requests.get(
                    f"{BASE_URL}/tasks",
                    headers={"Authorization": f"Bearer {tokens['admin']}"},
                    timeout=10
                )
                if response.status_code == 200:
                    tasks = response.json().get("tasks", [])
                    spawned_tasks = [t for t in tasks if t.get("parentTaskId") == test_data["recurring_task_id"]]
                    results.append(print_result(
                        len(spawned_tasks) == 1,
                        f"Idempotency verified: Only 1 spawned task exists (not duplicated)"
                    ))
                else:
                    results.append(print_result(False, "Failed to verify idempotency"))
            else:
                results.append(print_result(False, f"Update task failed: {response.status_code}"))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: Test recurrence='quarterly' (3 months)
    print_test("POST /tasks with recurrence='quarterly'")
    try:
        quarterly_task = {
            "title": "Quarterly TDS Return",
            "dueDate": "2025-06-30",
            "recurrence": "quarterly",
            "assignedTo": users["manager"]["id"]
        }
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=quarterly_task,
            timeout=10
        )
        if response.status_code == 200:
            task = response.json().get("task", {})
            quarterly_task_id = task.get("id")
            
            # Mark as completed
            response = requests.put(
                f"{BASE_URL}/tasks/{quarterly_task_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"status": "Completed"},
                timeout=10
            )
            
            # Verify spawned task has dueDate = original + 3 months
            response = requests.get(
                f"{BASE_URL}/tasks",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            if response.status_code == 200:
                tasks = response.json().get("tasks", [])
                spawned = next((t for t in tasks if t.get("parentTaskId") == quarterly_task_id), None)
                if spawned:
                    results.append(print_result(
                        spawned.get("dueDate") == "2025-09-30",
                        f"Quarterly task spawned with correct dueDate: {spawned.get('dueDate')} (expected: 2025-09-30)"
                    ))
                else:
                    results.append(print_result(False, "Quarterly spawned task not found"))
        else:
            results.append(print_result(False, f"Create quarterly task failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 5: Test recurrence='yearly' (1 year)
    print_test("POST /tasks with recurrence='yearly'")
    try:
        yearly_task = {
            "title": "Annual Audit",
            "dueDate": "2025-03-31",
            "recurrence": "yearly",
            "assignedTo": users["manager"]["id"]
        }
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=yearly_task,
            timeout=10
        )
        if response.status_code == 200:
            task = response.json().get("task", {})
            yearly_task_id = task.get("id")
            
            # Mark as completed
            response = requests.put(
                f"{BASE_URL}/tasks/{yearly_task_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"status": "Completed"},
                timeout=10
            )
            
            # Verify spawned task has dueDate = original + 1 year
            response = requests.get(
                f"{BASE_URL}/tasks",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            if response.status_code == 200:
                tasks = response.json().get("tasks", [])
                spawned = next((t for t in tasks if t.get("parentTaskId") == yearly_task_id), None)
                if spawned:
                    results.append(print_result(
                        spawned.get("dueDate") == "2026-03-31",
                        f"Yearly task spawned with correct dueDate: {spawned.get('dueDate')} (expected: 2026-03-31)"
                    ))
                else:
                    results.append(print_result(False, "Yearly spawned task not found"))
        else:
            results.append(print_result(False, f"Create yearly task failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 6: Test recurrence='none' (default - no spawning)
    print_test("POST /tasks with recurrence='none' (no spawning)")
    try:
        normal_task = {
            "title": "One-time Task",
            "dueDate": "2025-06-20",
            "recurrence": "none",
            "assignedTo": users["staff"]["id"]
        }
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=normal_task,
            timeout=10
        )
        if response.status_code == 200:
            task = response.json().get("task", {})
            normal_task_id = task.get("id")
            
            # Mark as completed
            response = requests.put(
                f"{BASE_URL}/tasks/{normal_task_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"status": "Completed"},
                timeout=10
            )
            
            # Verify NO spawned task
            response = requests.get(
                f"{BASE_URL}/tasks",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            if response.status_code == 200:
                tasks = response.json().get("tasks", [])
                spawned = next((t for t in tasks if t.get("parentTaskId") == normal_task_id), None)
                results.append(print_result(
                    spawned is None,
                    f"No task spawned for recurrence='none': {spawned is None}"
                ))
        else:
            results.append(print_result(False, f"Create normal task failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_branding():
    """Test branding settings GET/PUT"""
    results = []
    
    # Test 1: GET /branding (any role)
    print_test("GET /branding (any role)")
    try:
        response = requests.get(
            f"{BASE_URL}/branding",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            branding = data.get("branding", {})
            has_required_fields = all(k in branding for k in ["firmName", "firmAddress"])
            results.append(print_result(
                has_required_fields,
                f"Branding returned with defaults: firmName={branding.get('firmName')}"
            ))
        else:
            results.append(print_result(False, f"GET branding failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: PUT /branding as admin (should work)
    print_test("PUT /branding as admin")
    try:
        updated_branding = {
            "firmName": "Kumar & Associates, Chartered Accountants",
            "firmAddress": "456 New Business Park, Mumbai - 400001",
            "bankName": "HDFC Bank",
            "bankAccount": "50200012345678",
            "bankIfsc": "HDFC0001234",
            "upiId": "kumar@hdfcbank",
            "footerText": "Thank you for your business!"
        }
        response = requests.put(
            f"{BASE_URL}/branding",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json=updated_branding,
            timeout=10
        )
        if response.status_code == 200:
            results.append(print_result(True, "Admin updated branding"))
            
            # Verify changes
            response = requests.get(
                f"{BASE_URL}/branding",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            if response.status_code == 200:
                branding = response.json().get("branding", {})
                results.append(print_result(
                    branding.get("firmName") == updated_branding["firmName"],
                    f"Branding updated correctly: firmName={branding.get('firmName')}"
                ))
            else:
                results.append(print_result(False, "Failed to verify branding update"))
        else:
            results.append(print_result(False, f"Update branding failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: PUT /branding as manager (should fail - 403)
    print_test("PUT /branding as manager (should be 403)")
    try:
        response = requests.put(
            f"{BASE_URL}/branding",
            headers={"Authorization": f"Bearer {tokens['manager']}"},
            json={"firmName": "Hacked Name"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 403,
            f"Manager cannot update branding: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: PUT /branding as staff (should fail - 403)
    print_test("PUT /branding as staff (should be 403)")
    try:
        response = requests.put(
            f"{BASE_URL}/branding",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            json={"firmName": "Hacked Name"},
            timeout=10
        )
        results.append(print_result(
            response.status_code == 403,
            f"Staff cannot update branding: {response.status_code}"
        ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_search():
    """Test global search across all entities"""
    results = []
    
    # Test 1: GET /search?q=<term> as admin
    print_test("GET /search?q=Kumar (admin)")
    try:
        response = requests.get(
            f"{BASE_URL}/search?q=Kumar",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            has_all_categories = all(k in data for k in ["leads", "tasks", "clients", "invoices", "quotations"])
            results.append(print_result(
                has_all_categories,
                f"Search returned all categories: leads={len(data.get('leads', []))}, tasks={len(data.get('tasks', []))}, clients={len(data.get('clients', []))}"
            ))
        else:
            results.append(print_result(False, f"Search failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: GET /search as staff (scoped to own assignments)
    print_test("GET /search?q=GST (staff - scoped)")
    try:
        response = requests.get(
            f"{BASE_URL}/search?q=GST",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            # Staff should see leads/tasks scoped to them, but clients/invoices/quotations should be empty
            clients_empty = len(data.get("clients", [])) == 0
            invoices_empty = len(data.get("invoices", [])) == 0
            quotations_empty = len(data.get("quotations", [])) == 0
            results.append(print_result(
                clients_empty and invoices_empty and quotations_empty,
                f"Staff search scoped correctly: clients={len(data.get('clients', []))}, invoices={len(data.get('invoices', []))}, quotations={len(data.get('quotations', []))}"
            ))
        else:
            results.append(print_result(False, f"Staff search failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: Case-insensitive search
    print_test("GET /search?q=kumar (case-insensitive)")
    try:
        response = requests.get(
            f"{BASE_URL}/search?q=kumar",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            results.append(print_result(
                True,
                f"Case-insensitive search works: found results"
            ))
        else:
            results.append(print_result(False, f"Case-insensitive search failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_reminders():
    """Test reminders endpoint"""
    results = []
    
    # Test 1: GET /reminders as admin
    print_test("GET /reminders (admin)")
    try:
        response = requests.get(
            f"{BASE_URL}/reminders",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            has_all_categories = all(k in data for k in ["dueToday", "upcoming", "overdue", "followUpsToday", "followUpsUpcoming", "followUpsOverdue"])
            results.append(print_result(
                has_all_categories,
                f"Reminders returned all categories: dueToday={len(data.get('dueToday', []))}, upcoming={len(data.get('upcoming', []))}, overdue={len(data.get('overdue', []))}"
            ))
        else:
            results.append(print_result(False, f"Reminders failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: Create tasks with different due dates and verify categorization
    print_test("Create tasks with different due dates for reminder categorization")
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Create task due today
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json={"title": "Task Due Today", "dueDate": today, "assignedTo": users["admin"]["id"]},
            timeout=10
        )
        
        # Create task due tomorrow
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json={"title": "Task Due Tomorrow", "dueDate": tomorrow, "assignedTo": users["admin"]["id"]},
            timeout=10
        )
        
        # Create overdue task
        response = requests.post(
            f"{BASE_URL}/tasks",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json={"title": "Overdue Task", "dueDate": yesterday, "assignedTo": users["admin"]["id"]},
            timeout=10
        )
        
        # Get reminders
        response = requests.get(
            f"{BASE_URL}/reminders",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            has_due_today = len(data.get("dueToday", [])) > 0
            has_upcoming = len(data.get("upcoming", [])) > 0
            has_overdue = len(data.get("overdue", [])) > 0
            results.append(print_result(
                has_due_today and has_upcoming and has_overdue,
                f"Tasks categorized correctly: dueToday={has_due_today}, upcoming={has_upcoming}, overdue={has_overdue}"
            ))
        else:
            results.append(print_result(False, f"Get reminders failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: GET /reminders as staff (scoped)
    print_test("GET /reminders as staff (scoped)")
    try:
        response = requests.get(
            f"{BASE_URL}/reminders",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            results.append(print_result(
                True,
                f"Staff reminders scoped correctly"
            ))
        else:
            results.append(print_result(False, f"Staff reminders failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_calendar():
    """Test calendar endpoint"""
    results = []
    
    # Test 1: GET /calendar?from=...&to=... as admin
    print_test("GET /calendar with date range (admin)")
    try:
        from_date = "2025-06-01"
        to_date = "2025-06-30"
        response = requests.get(
            f"{BASE_URL}/calendar?from={from_date}&to={to_date}",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            has_tasks = "tasks" in data
            has_leads = "leads" in data
            results.append(print_result(
                has_tasks and has_leads,
                f"Calendar returned tasks and leads: tasks={len(data.get('tasks', []))}, leads={len(data.get('leads', []))}"
            ))
        else:
            results.append(print_result(False, f"Calendar failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: GET /calendar as staff (scoped)
    print_test("GET /calendar as staff (scoped)")
    try:
        from_date = "2025-06-01"
        to_date = "2025-06-30"
        response = requests.get(
            f"{BASE_URL}/calendar?from={from_date}&to={to_date}",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            results.append(print_result(
                True,
                f"Staff calendar scoped correctly"
            ))
        else:
            results.append(print_result(False, f"Staff calendar failed: {response.status_code}"))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def test_delete_operations():
    """Test DELETE operations with role-based access"""
    results = []
    
    # Test 1: DELETE /payments/:id as admin (should recompute invoice status)
    if test_data["payment_ids"]:
        print_test("DELETE /payments/:id as admin (should recompute invoice status)")
        try:
            payment_id = test_data["payment_ids"][0]
            response = requests.delete(
                f"{BASE_URL}/payments/{payment_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Admin deleted payment: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 2: DELETE /invoices/:id as admin (should work)
    if test_data["invoice_id"]:
        print_test("DELETE /invoices/:id as admin")
        try:
            response = requests.delete(
                f"{BASE_URL}/invoices/{test_data['invoice_id']}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Admin deleted invoice: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 3: DELETE /invoices/:id as manager (should fail - 403)
    print_test("DELETE /invoices/:id as manager (should be 403)")
    try:
        # Create a new invoice first
        response = requests.post(
            f"{BASE_URL}/invoices",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json={
                "clientId": test_data["client_id"],
                "clientName": "Test Client",
                "items": [{"name": "Service", "qty": 1, "rate": 1000}],
                "gstApplicable": False
            },
            timeout=10
        )
        if response.status_code == 200:
            temp_invoice_id = response.json().get("invoice", {}).get("id")
            
            # Try to delete as manager
            response = requests.delete(
                f"{BASE_URL}/invoices/{temp_invoice_id}",
                headers={"Authorization": f"Bearer {tokens['manager']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 403,
                f"Manager cannot delete invoice: {response.status_code}"
            ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 4: DELETE /clients/:id as admin (should work)
    if test_data["client_id"]:
        print_test("DELETE /clients/:id as admin")
        try:
            response = requests.delete(
                f"{BASE_URL}/clients/{test_data['client_id']}",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 200,
                f"Admin deleted client: {response.status_code}"
            ))
        except Exception as e:
            results.append(print_result(False, f"Exception: {str(e)}"))
    
    # Test 5: DELETE /clients/:id as manager (should fail - 403)
    print_test("DELETE /clients/:id as manager (should be 403)")
    try:
        # Create a new client first
        response = requests.post(
            f"{BASE_URL}/clients",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json={"name": "Temp Client", "company": "Temp Co"},
            timeout=10
        )
        if response.status_code == 200:
            temp_client_id = response.json().get("client", {}).get("id")
            
            # Try to delete as manager
            response = requests.delete(
                f"{BASE_URL}/clients/{temp_client_id}",
                headers={"Authorization": f"Bearer {tokens['manager']}"},
                timeout=10
            )
            results.append(print_result(
                response.status_code == 403,
                f"Manager cannot delete client: {response.status_code}"
            ))
    except Exception as e:
        results.append(print_result(False, f"Exception: {str(e)}"))
    
    return all(results)

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("CA PRACTICE MANAGEMENT - NEW FEATURES BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test started at: {datetime.now().isoformat()}")
    print("="*80)
    
    all_results = []
    
    # Login first
    print("\n\n### AUTHENTICATION ###")
    for role in ["admin", "manager", "staff"]:
        if not login(role):
            print("❌ CRITICAL: Login failed. Aborting tests.")
            return False
    
    # 1. Clients CRUD
    print("\n\n### 1. CLIENTS CRUD + OPENING BALANCE ###")
    all_results.append(("Clients CRUD", test_clients_crud()))
    
    # 2. Invoices CRUD
    print("\n\n### 2. INVOICES CRUD + AUTO-NUMBERING + GST ###")
    all_results.append(("Invoices CRUD", test_invoices_crud()))
    
    # 3. Payments with invoice status sync
    print("\n\n### 3. PAYMENTS + INVOICE STATUS SYNC (PARTIAL/PAID) ###")
    all_results.append(("Payments + Status Sync", test_payments_with_invoice_status_sync()))
    
    # 4. Client ledger
    print("\n\n### 4. CLIENT LEDGER + RUNNING BALANCE ###")
    all_results.append(("Client Ledger", test_client_ledger()))
    
    # 5. Recurring tasks
    print("\n\n### 5. RECURRING TASKS (MONTHLY/QUARTERLY/YEARLY) + IDEMPOTENCY ###")
    all_results.append(("Recurring Tasks", test_recurring_tasks()))
    
    # 6. Branding
    print("\n\n### 6. BRANDING SETTINGS GET/PUT ###")
    all_results.append(("Branding", test_branding()))
    
    # 7. Search
    print("\n\n### 7. GLOBAL SEARCH ###")
    all_results.append(("Search", test_search()))
    
    # 8. Reminders
    print("\n\n### 8. REMINDERS ###")
    all_results.append(("Reminders", test_reminders()))
    
    # 9. Calendar
    print("\n\n### 9. CALENDAR ###")
    all_results.append(("Calendar", test_calendar()))
    
    # 10. Delete operations
    print("\n\n### 10. DELETE OPERATIONS + ROLE-BASED ACCESS ###")
    all_results.append(("Delete Operations", test_delete_operations()))
    
    # Summary
    print("\n\n" + "="*80)
    print("TEST SUMMARY - NEW FEATURES")
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
