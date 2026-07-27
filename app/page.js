'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard, Users, Target, ListChecks, FileText, LogOut, Plus,
  Search, Trash2, Edit, ArrowRight, Calendar, Briefcase,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, Sparkles, FileSpreadsheet,
  FileDown, ChevronRight, Wallet, Receipt, Palette, Bell,
  IndianRupee, Building2, ChevronLeft, RotateCcw, Upload, KeyRound,
  BarChart3, ClipboardCheck, ShieldCheck, Database, DownloadCloud, UploadCloud,
  MessageSquare, Menu, X, ArrowUpDown, ArrowUp, ArrowDown, Send, Loader2,
  Sun, Moon, FilePlus, PlusCircle, MinusCircle, Eye, MapPin, UserCheck, CalendarCheck, CheckSquare, Share2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';

const SERVICE_TYPES = ['GST', 'Tax', 'Audit', 'Accounting', 'Other'];
const LEAD_SOURCES = ['Referral', 'Website', 'Walk-in', 'Other'];
const LEAD_STATUSES = ['New', 'In Progress', 'Converted', 'Cancelled'];
const TASK_CATEGORIES = ['Tax', 'Audit', 'GST', 'Filing', 'Internal', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const TASK_STATUSES = ['Pending', 'In Progress', 'Completed'];
const ROLES = ['admin', 'manager', 'staff'];

function useApi() {
  const tokenRef = () => (typeof window !== 'undefined' ? localStorage.getItem('ca_token') : null);
  const activeOrgRef = () => (typeof window !== 'undefined' ? localStorage.getItem('ca_active_org_id') : null);
  async function call(path, opts = {}) {
    const res = await fetch(`/api/${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(tokenRef() ? { Authorization: `Bearer ${tokenRef()}` } : {}),
        ...(activeOrgRef() ? { 'x-org-id': activeOrgRef() } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  return { call };
}

async function exportToExcel(rows, filename) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}

async function generateQuotationPDF(q, branding = {}) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 90, 'F');
  if (branding.logoBase64) {
    try { doc.addImage(branding.logoBase64, 'PNG', 40, 18, 56, 56); } catch {}
  }
  const xOff = branding.logoBase64 ? 108 : 40;
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(q.firmName || 'CA Firm', xOff, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(q.firmAddress || '', xOff, 56);
  doc.text(q.firmContact || '', xOff, 70);
  if (q.firmGstin) doc.text(`GSTIN: ${q.firmGstin}`, xOff, 82);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('QUOTATION', pageW - 40, 130, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`No: ${q.quotationNumber}`, pageW - 40, 148, { align: 'right' });
  doc.text(`Date: ${new Date(q.createdAt).toLocaleDateString('en-IN')}`, pageW - 40, 162, { align: 'right' });
  if (q.validUntil) doc.text(`Valid until: ${new Date(q.validUntil).toLocaleDateString('en-IN')}`, pageW - 40, 176, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('BILL TO', 40, 130);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 148;
  doc.text(q.clientName || '', 40, y); y += 14;
  if (q.companyName) { doc.text(q.companyName, 40, y); y += 14; }
  if (q.clientAddress) { doc.text(q.clientAddress, 40, y); y += 14; }
  if (q.clientEmail) { doc.text(q.clientEmail, 40, y); y += 14; }
  if (q.clientPhone) { doc.text(q.clientPhone, 40, y); y += 14; }

  const rows = (q.services || []).map((s, i) => [
    i + 1,
    s.name,
    s.description || '-',
    String(s.qty || 1),
    `INR ${Number(s.price).toLocaleString('en-IN')}`,
    `INR ${(Number(s.price) * Number(s.qty || 1)).toLocaleString('en-IN')}`,
  ]);
  autoTable(doc, {
    startY: Math.max(y + 10, 220),
    head: [['#', 'Service', 'Description', 'Qty', 'Rate', 'Amount']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      0: { cellWidth: 28 },
      3: { halign: 'center', cellWidth: 40 },
      4: { halign: 'right', cellWidth: 80 },
      5: { halign: 'right', cellWidth: 90 },
    },
  });

  let endY = doc.lastAutoTable.finalY + 10;
  const boxX = pageW - 240;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Subtotal:', boxX, endY + 14);
  doc.text(`INR ${q.subtotal.toLocaleString('en-IN')}`, pageW - 40, endY + 14, { align: 'right' });
  if (q.gstApplicable) {
    doc.text('GST (18%):', boxX, endY + 30);
    doc.text(`INR ${q.gstAmount.toLocaleString('en-IN')}`, pageW - 40, endY + 30, { align: 'right' });
    endY += 16;
  }
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1);
  doc.line(boxX, endY + 36, pageW - 40, endY + 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', boxX, endY + 52);
  doc.text(`INR ${q.total.toLocaleString('en-IN')}`, pageW - 40, endY + 52, { align: 'right' });

  let tY = endY + 80;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Terms & Conditions', 40, tY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const wrapped = doc.splitTextToSize(q.terms || '', pageW - 80);
  doc.text(wrapped, 40, tY + 14);

  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(200);
  doc.line(40, ph - 60, pageW - 40, ph - 60);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Issued by ${q.createdByName || 'CA Firm'}`, 40, ph - 42);
  doc.text('This is a computer-generated quotation.', pageW - 40, ph - 42, { align: 'right' });

  doc.save(`${q.quotationNumber}_${(q.clientName || 'client').replace(/\s+/g, '_')}.pdf`);
}

function SortableHeader({ label, field, currentField, currentOrder, onSort, className = '' }) {
  const isRight = className.includes('text-right');
  return (
    <TableHead className={`cursor-pointer select-none hover:bg-slate-100/50 transition py-2 ${className}`} onClick={() => onSort(field)}>
      <div className={`flex items-center gap-1 ${isRight ? 'justify-end' : ''}`}>
        <span>{label}</span>
        {currentField === field ? (
          currentOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600 shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 shrink-0" />
        )}
      </div>
    </TableHead>
  );
}

function Pagination({ currentPage, totalItems, limit, onPageChange, className = '' }) {
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white ${className}`}>
      <div className="text-sm text-slate-500">
        Showing <span className="font-medium">{totalItems === 0 ? 0 : (currentPage - 1) * limit + 1}</span> to{' '}
        <span className="font-medium">{Math.min(currentPage * limit, totalItems)}</span> of{' '}
        <span className="font-medium">{totalItems}</span> results
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canPrev}
          className="h-8 px-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-sm font-medium text-slate-700 px-1">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canNext}
          className="h-8 px-2"
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [view, setViewName] = useState('dashboard');
  const [viewParams, setViewParams] = useState({});

  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ca_theme') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      localStorage.setItem('ca_theme', theme);
    }
  }, [theme]);

  function setView(name, params = {}) {
    setViewName(name);
    setViewParams(params);
  }

  useEffect(() => {
    const token = localStorage.getItem('ca_token');
    const stored = localStorage.getItem('ca_user');
    if (token && stored) {
      try {
        setUser(JSON.parse(stored));
        // Async update user from server to synchronize active org & role
        fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
            ...(localStorage.getItem('ca_active_org_id') ? { 'x-org-id': localStorage.getItem('ca_active_org_id') } : {}),
          }
        })
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (data.user) {
            localStorage.setItem('ca_user', JSON.stringify(data.user));
            setUser(data.user);
            if (data.user.activeOrgId) {
              localStorage.setItem('ca_active_org_id', data.user.activeOrgId);
            }
          } else {
            logout();
          }
        })
        .catch(() => {
          logout();
        });
      } catch {
        logout();
      }
    }
    setBooting(false);
  }, []);

  function handleLogin(u, token) {
    localStorage.setItem('ca_token', token);
    localStorage.setItem('ca_user', JSON.stringify(u));
    setUser(u);
    // Fetch fresh user profile with organizations and activeOrgId immediately
    fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    })
    .then(res => res.json())
    .then(data => {
      if (data.user) {
        localStorage.setItem('ca_user', JSON.stringify(data.user));
        setUser(data.user);
        if (data.user.activeOrgId) {
          localStorage.setItem('ca_active_org_id', data.user.activeOrgId);
        }
      }
    })
    .catch(() => {});
  }
  function logout() {
    localStorage.removeItem('ca_token');
    localStorage.removeItem('ca_user');
    setUser(null);
  }

  if (booting) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }
  if (!user) return <Login onLogin={handleLogin} />;
  return <Shell user={user} onUserUpdated={setUser} view={view} viewParams={viewParams} setView={setView} onLogout={logout} theme={theme} setTheme={setTheme} />;
}

function Login({ onLogin }) {
  const { call } = useApi();
  const [email, setEmail] = useState('admin@ca.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await call('auth/login', { method: 'POST', body: { email, password } });
      onLogin(data.user, data.token);
      toast.success(`Welcome ${data.user.name}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50/50">
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden bg-indigo-50/20 border-r border-slate-100/80">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-24 -left-24 w-[500px] h-[500px] bg-indigo-300 rounded-full blur-3xl animate-pulse duration-4000" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-emerald-200 rounded-full blur-3xl animate-pulse duration-4000" />
        </div>
        <div className="relative z-10 max-w-lg text-slate-800">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">CA Practice Manager</span>
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight mb-6 text-slate-900">
            The modern OS for your <span className="text-indigo-600">CA firm</span>.
          </h1>
          <p className="text-sm text-slate-600 mb-8 leading-relaxed">
            Replace spreadsheets and WhatsApp chaos. Manage leads, assign tasks, generate
            beautiful PDF quotations — all in one place.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Target, t: 'Lead Tracking', d: 'Full pipeline + history' },
              { icon: ListChecks, t: 'Task Workflows', d: 'Assign & track teams' },
              { icon: FileText, t: 'PDF Quotations', d: 'Auto-numbered, branded' },
              { icon: FileSpreadsheet, t: 'Excel Exports', d: 'Filter-aware downloads' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="p-4 rounded-xl bg-white border border-slate-100 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                <Icon className="w-5 h-5 text-indigo-600 mb-2" />
                <div className="font-semibold text-slate-900 text-sm">{t}</div>
                <div className="text-xs text-slate-500 mt-0.5">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-xl border-slate-100 bg-white p-2">
          <CardHeader>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">Sign in</CardTitle>
            <CardDescription className="text-slate-500">Access your CA practice dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-slate-700 text-xs font-semibold mb-1 block">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="shadow-sm" />
              </div>
              <div>
                <Label htmlFor="password" className="text-slate-700 text-xs font-semibold mb-1 block">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="shadow-sm" />
              </div>
              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-sm transition-all py-2 cursor-pointer mt-2" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
            <Separator className="my-6 border-slate-100" />
            <div className="text-xs text-slate-500 space-y-1 bg-slate-50 p-3.5 rounded-lg border border-slate-100 shadow-sm">
              <div className="font-semibold text-slate-700 mb-2 uppercase tracking-wider text-[10px]">Demo credentials:</div>
              <div className="flex justify-between items-center"><span className="font-mono text-slate-600">admin@ca.com / admin123</span> <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">Admin</span></div>
              <div className="flex justify-between items-center"><span className="font-mono text-slate-600">manager@ca.com / manager123</span> <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">Manager</span></div>
              <div className="flex justify-between items-center"><span className="font-mono text-slate-600">staff@ca.com / staff123</span> <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-medium">Staff</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Shell({ user, onUserUpdated, view, viewParams, setView, onLogout, theme, setTheme }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const { call } = useApi();
  const [organisations, setOrganisations] = useState([]);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editOrgName, setEditOrgName] = useState('');
  const [editingOrg, setEditingOrg] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsAppInstalled(true);
      toast.success('App installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsAppInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function handleInstallApp() {
    if (!deferredPrompt) {
      setInstallHelpOpen(true);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast.success('Thank you for installing the app!');
    }
    setDeferredPrompt(null);
  }

  async function loadOrganisations() {
    try {
      const data = await call('organisations');
      if (data.organisations) {
        setOrganisations(data.organisations);
      }
    } catch (e) {
      console.error('Failed to load organizations:', e);
      if (e.message && (e.message.includes('Unauthorized') || e.message.includes('401'))) {
        onLogout();
      }
    }
  }

  useEffect(() => {
    loadOrganisations();
  }, [user.activeOrgId]);

  const activeOrgName = useMemo(() => {
    const active = organisations.find(o => o.id === user.activeOrgId);
    return active ? active.name : 'Default Org';
  }, [organisations, user.activeOrgId]);

  async function handleSwitchOrg(orgId) {
    localStorage.setItem('ca_active_org_id', orgId);
    toast.success('Switching organization...');
    try {
      const data = await call('auth/me');
      if (data.user) {
        localStorage.setItem('ca_user', JSON.stringify(data.user));
        onUserUpdated(data.user);
        setView('dashboard');
      }
    } catch (e) {
      toast.error('Failed to switch organization');
    }
  }

  async function handleCreateOrg(e) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const data = await call('organisations', {
        method: 'POST',
        body: { name: newOrgName.trim() }
      });
      if (data.ok) {
        toast.success('Organization created successfully');
        setNewOrgName('');
        setCreateOrgOpen(false);
        if (data.organisation && data.organisation.id) {
          await handleSwitchOrg(data.organisation.id);
        }
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleEditOrg(e) {
    e.preventDefault();
    if (!editOrgName.trim()) return;
    setEditingOrg(true);
    try {
      const data = await call(`organisations/${user.activeOrgId}`, {
        method: 'PUT',
        body: { name: editOrgName.trim() }
      });
      if (data.ok) {
        toast.success('Organization updated successfully');
        setEditOrgOpen(false);
        await loadOrganisations();
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setEditingOrg(false);
    }
  }

  const navItems = useMemo(() => {
    const all = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard' },
      { key: 'calendar', label: 'Calendar', icon: Calendar, perm: 'calendar' },
      { key: 'appointments', label: 'Appointments', icon: CalendarCheck, perm: 'appointments' },
      { key: 'leads', label: 'Leads', icon: Target, perm: 'leads' },
      { key: 'tasks', label: 'Tasks', icon: ListChecks, perm: 'tasks' },
    ];
    if (user.role !== 'staff') {
      all.push({ key: 'clients', label: 'Clients', icon: Building2, perm: 'clients' });
      all.push({ key: 'invoices', label: 'Invoices', icon: Receipt, perm: 'invoices' });
      all.push({ key: 'receivables', label: 'Receivables', icon: BarChart3, perm: 'receivables' });
    }
    all.push({ key: 'quotations', label: 'Quotations', icon: FileText, perm: 'quotations' });
    if (user.role === 'admin') {
      all.push({ key: 'organisations', label: 'Organizations', icon: Building2, perm: 'organisations' });
      all.push({ key: 'compliances', label: 'Compliances', icon: ClipboardCheck, perm: 'compliances' });
      all.push({ key: 'users', label: 'Staff', icon: Users, perm: 'users' });
      all.push({ key: 'branding', label: 'Branding', icon: Palette, perm: 'branding' });
      all.push({ key: 'backup', label: 'Backup', icon: Database, perm: 'backup' });
    }
    // Apply permissions (admin bypasses)
    if (user.role === 'admin') return all;
    const perms = user.permissions || {};
    return all.filter(item => perms[item.perm] !== false);
  }, [user.role, user.permissions]);

  function navigate(key) {
    setView(key);
    setSidebarOpen(false);
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fixed on mobile (slide-out), static on desktop */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40 w-64 bg-white text-slate-700 flex flex-col border-r border-slate-100/80 shadow-sm md:shadow-none
        transform transition-transform duration-200 md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 tracking-tight text-sm">CA Manager</div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Practice Suite</div>
            </div>
          </div>
          <button
            className="md:hidden text-slate-400 hover:text-slate-600"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Organization Switcher */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Active Organization
          </label>
          <div className="flex items-center gap-1.5 min-w-0">
            <select
              value={user.activeOrgId || ''}
              onChange={(e) => handleSwitchOrg(e.target.value)}
              className="flex-1 min-w-0 bg-white text-slate-700 text-xs rounded border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer truncate shadow-sm"
            >
              {organisations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} {o.role === 'admin' ? ' (Admin)' : ''}
                </option>
              ))}
            </select>
            {user.role === 'admin' && (
              <Button
                variant="outline"
                size="icon"
                className="w-8 h-8 rounded border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 bg-white shrink-0 cursor-pointer p-0 flex items-center justify-center shadow-sm"
                onClick={() => {
                  const active = organisations.find(o => o.id === user.activeOrgId);
                  setEditOrgName(active ? active.name : '');
                  setEditOrgOpen(true);
                }}
                title="Edit Organization Name"
              >
                <Edit className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 bg-white shrink-0 cursor-pointer p-0 flex items-center justify-center shadow-sm"
              onClick={() => setCreateOrgOpen(true)}
              title="Create New Organization"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition ${
                view === item.key 
                  ? 'bg-indigo-50 text-indigo-600 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)]' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon className={`w-4 h-4 ${view === item.key ? 'text-indigo-600' : 'text-slate-400'}`} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          {!isAppInstalled && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mb-2 bg-indigo-50/50 border-indigo-100/50 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-center gap-2 cursor-pointer text-xs shadow-sm"
              onClick={handleInstallApp}
              title="Install this app on your phone as a full-screen Web App"
            >
              <DownloadCloud className="w-4 h-4 text-indigo-500" /> Install Web App
            </Button>
          )}
          <div className="px-3 py-1.5 mb-2">
            <div className="text-xs font-semibold text-slate-800">{user.name}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{user.role}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full mb-2 bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-xs shadow-sm" onClick={() => { setProfileOpen(true); setSidebarOpen(false); }}>
            <KeyRound className="w-3.5 h-3.5 mr-2 text-slate-400" /> My Profile
          </Button>
          <Button variant="outline" size="sm" className="w-full bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-xs shadow-sm" onClick={onLogout}>
            <LogOut className="w-3.5 h-3.5 mr-2 text-slate-400" /> Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        <TopBar user={user} setView={setView} onMenuClick={() => setSidebarOpen(true)} activeOrgName={activeOrgName} onOpenProfile={() => setProfileOpen(true)} theme={theme} setTheme={setTheme} />
        <div className="p-3 sm:p-4 md:p-6 max-w-[1400px] mx-auto">
          {view === 'dashboard' && <Dashboard user={user} setView={setView} onOpenProfile={() => setProfileOpen(true)} />}
          {view === 'calendar' && <CalendarView user={user} setView={setView} />}
          {view === 'appointments' && <AppointmentsView user={user} viewParams={viewParams} setView={setView} />}
          {view === 'leads' && <Leads user={user} viewParams={viewParams} setView={setView} />}
          {view === 'tasks' && <Tasks user={user} viewParams={viewParams} setView={setView} />}
          {view === 'clients' && <ClientsView user={user} setView={setView} viewParams={viewParams} />}
          {view === 'invoices' && <InvoicesView user={user} viewParams={viewParams} setView={setView} />}
          {view === 'receivables' && <ReceivablesView user={user} setView={setView} />}
          {view === 'quotations' && <Quotations user={user} viewParams={viewParams} setView={setView} />}
          {view === 'users' && <UsersView user={user} />}
          {view === 'branding' && <BrandingView user={user} />}
          {view === 'compliances' && <CompliancesView user={user} />}
          {view === 'organisations' && <OrganisationsAdminView user={user} />}
          {view === 'backup' && <BackupView user={user} />}
        </div>
      </main>
      {profileOpen && <MyProfileDialog user={user} onUserUpdated={onUserUpdated} onClose={() => setProfileOpen(false)} />}
      {createOrgOpen && (
        <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
              <DialogDescription>
                Create a separate organization to manage different branches, clients, and teams.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateOrg}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    placeholder="e.g. West Coast Branch, CA Firm LLP"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOrgOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creatingOrg}>
                  {creatingOrg ? 'Creating...' : 'Create Organization'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {editOrgOpen && (
        <Dialog open={editOrgOpen} onOpenChange={setEditOrgOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Organization</DialogTitle>
              <DialogDescription>
                Change the name of your organization.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditOrg}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-org-name">Organization Name</Label>
                  <Input
                    id="edit-org-name"
                    value={editOrgName}
                    onChange={(e) => setEditOrgName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOrgOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editingOrg}>
                  {editingOrg ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {installHelpOpen && (
        <Dialog open={installHelpOpen} onOpenChange={setInstallHelpOpen}>
          <DialogContent className="max-w-md w-[95vw] p-4 sm:p-6 bg-slate-900 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-400">
                <DownloadCloud className="w-5 h-5 text-indigo-400" /> Install on Google Chrome
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs sm:text-sm">
                Follow these simple steps to install the CA Practice Manager as a fast, light webapp on your Android device:
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-3 text-sm text-slate-300">
              <div className="flex gap-3 items-start">
                <div className="bg-slate-800 border border-slate-700 text-indigo-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-semibold text-slate-200">Open in Chrome</p>
                  <p className="text-xs text-slate-400">Ensure you are currently browsing this page using Google Chrome on your Android phone.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="bg-slate-800 border border-slate-700 text-indigo-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  2
                </div>
                <div>
                  <p className="font-semibold text-slate-200">Tap the Menu</p>
                  <p className="text-xs text-slate-400">Tap the three vertical dots menu (⋮) in Chrome's top-right corner.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="bg-slate-800 border border-slate-700 text-indigo-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  3
                </div>
                <div>
                  <p className="font-semibold text-slate-200">Select "Install app"</p>
                  <p className="text-xs text-slate-400">Choose <span className="font-bold text-slate-200">"Install app"</span> or <span className="font-bold text-slate-200">"Add to Home screen"</span> from the options menu.</p>
                </div>
              </div>
            </div>
            <DialogFooter className="pt-2 sm:pt-4 border-t border-slate-800">
              <Button type="button" className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer" onClick={() => setInstallHelpOpen(false)}>
                Got it
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MyProfileDialog({ user, onUserUpdated, onClose }) {
  const { call } = useApi();
  const [f, setF] = useState({
    name: user.name || '',
    email: user.email || '',
    currentPassword: '',
    newPassword: '',
    confirm: '',
    whatsappNumber: user.whatsappNumber || '',
    whatsappOptIn: !!user.whatsappOptIn,
    whatsappNotificationsEnabled: !!user.whatsappNotificationsEnabled,
    dailyRosterEnabled: !!user.dailyRosterEnabled,
    telegramChatId: user.telegramChatId || '',
    telegramOptIn: !!user.telegramOptIn,
    telegramNotificationsEnabled: !!user.telegramNotificationsEnabled,
    telegramDailyRosterEnabled: !!user.telegramDailyRosterEnabled,
  });
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [sendingRoster, setSendingRoster] = useState(false);

  async function sendManualRoster() {
    if (!f.telegramChatId && !f.whatsappNumber) {
      toast.error('Please configure at least one active channel (Telegram or WhatsApp) first.');
      return;
    }
    setSendingRoster(true);
    try {
      const res = await call('auth/send-manual-roster', {
        method: 'POST',
      });
      if (res.ok) {
        toast.success(res.message || 'Daily roster generated and sent successfully!');
      } else {
        toast.error(res.error || 'Failed to send daily roster');
      }
    } catch (e) {
      toast.error(e.message || 'Error occurred while sending daily roster');
    } finally {
      setSendingRoster(false);
    }
  }

  async function testTelegram() {
    if (!f.telegramChatId) {
      toast.error('Please enter a Telegram Chat ID first');
      return;
    }
    setTestingTelegram(true);
    try {
      const res = await call('auth/test-telegram', {
        method: 'POST',
        body: { telegramChatId: f.telegramChatId },
      });
      if (res.ok) {
        toast.success('Test message sent successfully! Check your Telegram app.');
      } else {
        toast.error(res.error || 'Failed to send test message');
      }
    } catch (e) {
      toast.error(e.message || 'Error occurred while testing Telegram');
    } finally {
      setTestingTelegram(false);
    }
  }

  async function testWhatsApp() {
    if (!f.whatsappNumber) {
      toast.error('Please enter a WhatsApp Number first');
      return;
    }
    setTestingWhatsApp(true);
    try {
      const res = await call('auth/test-whatsapp', {
        method: 'POST',
        body: { whatsappNumber: f.whatsappNumber },
      });
      if (res.ok) {
        toast.success('Test template message sent successfully! Check your WhatsApp.');
      } else {
        toast.error(res.error || 'Failed to send test message');
      }
    } catch (e) {
      toast.error(e.message || 'Error occurred while testing WhatsApp');
    } finally {
      setTestingWhatsApp(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (f.newPassword && f.newPassword !== f.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const res = await call('auth/profile', {
        method: 'POST',
        body: {
          name: f.name,
          email: f.email,
          currentPassword: f.currentPassword || undefined,
          newPassword: f.newPassword || undefined,
          whatsappNumber: f.whatsappNumber,
          whatsappOptIn: !!f.whatsappOptIn,
          whatsappNotificationsEnabled: !!f.whatsappNotificationsEnabled,
          dailyRosterEnabled: !!f.dailyRosterEnabled,
          telegramChatId: f.telegramChatId,
          telegramOptIn: !!f.telegramOptIn,
          telegramNotificationsEnabled: !!f.telegramNotificationsEnabled,
          telegramDailyRosterEnabled: !!f.telegramDailyRosterEnabled,
        },
      });
      toast.success('Profile updated successfully');
      if (res.user && res.token) {
        localStorage.setItem('ca_token', res.token);
        localStorage.setItem('ca_user', JSON.stringify(res.user));
        if (onUserUpdated) onUserUpdated(res.user);
      }
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My Profile & Notifications</DialogTitle>
          <DialogDescription>Update your profile, security settings, and communication channels.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Basic Information</div>
            <Field label="Name *">
              <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
            </Field>
            <Field label="Email * (for Login & Display)">
              <Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
            </Field>
          </div>

          <Separator />

          {/* Telegram Settings */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Telegram Integration
            </div>
            
            <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100/60 text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
              <div className="font-semibold text-indigo-950 flex items-center gap-1">
                🤖 How to Connect Your Telegram:
              </div>
              <ol className="list-decimal pl-4 space-y-1">
                <li>
                  Open Telegram and message <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline font-bold text-indigo-700 hover:text-indigo-800">@userinfobot</a> to find your unique Chat ID.
                </li>
                <li>
                  Start the chat with the bot, and copy the numeric <strong className="text-indigo-950">Id</strong> (e.g. <code>123456789</code>) it sends.
                </li>
                <li>
                  Paste that ID in the field below, check the toggles, and click <strong className="text-indigo-950">Save Profile</strong>!
                </li>
                <li className="text-indigo-900 font-semibold mt-1">
                  ⚠️ Crucial step: Open our notification bot <a href={`https://t.me/${user?.telegramBotUsername || 'MockPracticeRosterBot'}`} target="_blank" rel="noopener noreferrer" className="underline font-bold text-indigo-600 hover:text-indigo-800">@{user?.telegramBotUsername || 'MockPracticeRosterBot'}</a> and click <strong className="text-indigo-950">/start</strong> to permit alerts.
                </li>
              </ol>
            </div>

            <Field label="Telegram Chat ID (e.g. 123456789)">
              <div className="flex gap-2">
                <Input 
                  type="text" 
                  placeholder="Paste your Telegram Chat ID here" 
                  value={f.telegramChatId || ''} 
                  onChange={e => setF({ ...f, telegramChatId: e.target.value })} 
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={testTelegram}
                  disabled={testingTelegram || !f.telegramChatId}
                  className="shrink-0 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  {testingTelegram ? 'Testing...' : 'Send Test'}
                </Button>
              </div>
            </Field>

            <div className="space-y-2 pl-1">
              <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={!!f.telegramOptIn} 
                  onChange={e => setF({ ...f, telegramOptIn: e.target.checked })} 
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" 
                />
                <span className="text-slate-700 font-medium">Telegram Opt-In Confirmed</span>
              </label>
              
              <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={!!f.telegramNotificationsEnabled} 
                  onChange={e => setF({ ...f, telegramNotificationsEnabled: e.target.checked })} 
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" 
                />
                <span className="text-slate-700 font-medium">Receive Task & Lead Alerts on Telegram</span>
              </label>
              
              <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={!!f.telegramDailyRosterEnabled} 
                  onChange={e => setF({ ...f, telegramDailyRosterEnabled: e.target.checked })} 
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" 
                />
                <span className="text-slate-700 font-medium">Receive Daily PDF Roster on Telegram</span>
              </label>
            </div>
          </div>

          <Separator />

          {/* WhatsApp Settings */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> WhatsApp Integration
            </div>

            <Field label="WhatsApp Number (with country code, e.g. 919876543210)">
              <div className="flex gap-2">
                <Input 
                  type="text" 
                  placeholder="e.g. 919876543210" 
                  value={f.whatsappNumber || ''} 
                  onChange={e => setF({ ...f, whatsappNumber: e.target.value })} 
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={testWhatsApp}
                  disabled={testingWhatsApp || !f.whatsappNumber}
                  className="shrink-0 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  {testingWhatsApp ? 'Testing...' : 'Send Test'}
                </Button>
              </div>
            </Field>

            <div className="space-y-2 pl-1">
              <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={!!f.whatsappOptIn} 
                  onChange={e => setF({ ...f, whatsappOptIn: e.target.checked })} 
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
                />
                <span className="text-slate-700 font-medium">WhatsApp Opt-In Confirmed</span>
              </label>
              
              <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={!!f.whatsappNotificationsEnabled} 
                  onChange={e => setF({ ...f, whatsappNotificationsEnabled: e.target.checked })} 
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
                />
                <span className="text-slate-700 font-medium">Receive Task & Lead Alerts on WhatsApp</span>
              </label>
              
              <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={!!f.dailyRosterEnabled} 
                  onChange={e => setF({ ...f, dailyRosterEnabled: e.target.checked })} 
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
                />
                <span className="text-slate-700 font-medium">Receive Daily PDF Roster on WhatsApp</span>
              </label>
            </div>
          </div>

          <Separator />

          {/* Manual Roster Dispatch */}
          <div className="space-y-3 p-3 bg-slate-50 border border-slate-200/60 rounded-lg">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileDown className="w-3.5 h-3.5 text-blue-600" /> On-Demand Roster Generator
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Generate your daily performance and task roster PDF right now and send it to your configured active communication channels (WhatsApp / Telegram).
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sendManualRoster}
              disabled={sendingRoster}
              className="w-full text-xs font-semibold bg-white border-blue-200 text-blue-700 hover:bg-blue-50/50 flex items-center justify-center gap-1.5"
            >
              {sendingRoster ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating & Dispatching...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Generate & Send Roster Now
                </>
              )}
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Change Password (Optional)</div>
            <Field label="Current Password">
              <Input type="password" value={f.currentPassword} onChange={e => setF({ ...f, currentPassword: e.target.value })} placeholder="Required only if changing password" />
            </Field>
            <Field label="New Password">
              <Input type="password" value={f.newPassword} onChange={e => setF({ ...f, newPassword: e.target.value })} minLength={6} placeholder="Min 6 characters" />
            </Field>
            <Field label="Confirm New Password">
              <Input type="password" value={f.confirm} onChange={e => setF({ ...f, confirm: e.target.value })} minLength={6} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TopBar({ user, setView, onMenuClick, activeOrgName, onOpenProfile, theme, setTheme }) {
  const { call } = useApi();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults(null); return; }
    const id = setTimeout(async () => {
      try {
        const d = await call(`search?q=${encodeURIComponent(q)}`);
        setResults(d);
        setOpen(true);
      } catch {}
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  function goto(type, id) {
    setOpen(false); setQ('');
    if (type === 'lead') setView('leads', { openId: id });
    else if (type === 'task') setView('tasks', { openId: id });
    else if (type === 'client') setView('clients', { openId: id });
    else if (type === 'invoice') setView('invoices', { openId: id });
    else if (type === 'quotation') setView('quotations', { openId: id });
  }

  const total = results ? (results.leads.length + results.tasks.length + results.clients.length + results.invoices.length + results.quotations.length) : 0;

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 py-2 sm:py-3 flex items-center justify-between gap-1.5 sm:gap-4">
        <button
          className="md:hidden p-2 -ml-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md shrink-0"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="relative flex-1 max-w-xl min-w-[120px]">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <Input
            placeholder="Search..."
            className="pl-9 text-sm w-full bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => results && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
          />
          {open && results && (
            <div className="absolute top-full mt-1.5 left-0 right-0 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-lg shadow-xl max-h-96 overflow-y-auto z-50">
              {total === 0 && <div className="p-4 text-sm text-slate-500">No results.</div>}
              {results.leads.length > 0 && <SearchGroup title="Leads" items={results.leads.map(l => ({ id: l.id, title: l.name, sub: `${l.serviceType} • ${l.phone}`, badge: l.status }))} onClick={(id) => goto('lead', id)} />}
              {results.tasks.length > 0 && <SearchGroup title="Tasks" items={results.tasks.map(t => ({ id: t.id, title: t.title, sub: `${t.category} • ${t.priority}`, badge: t.status }))} onClick={(id) => goto('task', id)} />}
              {results.clients.length > 0 && <SearchGroup title="Clients" items={results.clients.map(c => ({ id: c.id, title: c.name, sub: c.company || c.phone }))} onClick={(id) => goto('client', id)} />}
              {results.invoices.length > 0 && <SearchGroup title="Invoices" items={results.invoices.map(i => ({ id: i.id, title: i.invoiceNumber, sub: i.clientName, badge: i.status }))} onClick={(id) => goto('invoice', id)} />}
              {results.quotations.length > 0 && <SearchGroup title="Quotations" items={results.quotations.map(q => ({ id: q.id, title: q.quotationNumber, sub: q.clientName }))} onClick={(id) => goto('quotation', id)} />}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {activeOrgName && (
            <Badge variant="outline" className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs rounded-full">
              <Building2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              {activeOrgName}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full h-9 w-9 p-0 flex items-center justify-center cursor-pointer shrink-0"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            id="theme-toggle-btn"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-full h-9 w-9 p-0 flex items-center justify-center cursor-pointer shrink-0"
            onClick={onOpenProfile}
            title="Connect / Configure Telegram & WhatsApp Notifications"
          >
            <Send className="w-5 h-5" />
          </Button>
          <RemindersBell user={user} setView={setView} />
        </div>
      </div>
    </div>
  );
}

function SearchGroup({ title, items, onClick }) {
  return (
    <div className="border-b last:border-b-0 border-slate-100 dark:border-slate-800">
      <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 uppercase">{title}</div>
      {items.map((it, i) => (
        <button key={i} onClick={() => onClick(it.id)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{it.title}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{it.sub}</div>
          </div>
          {it.badge && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

function RemindersBell({ user, setView }) {
  const { call } = useApi();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  async function load() {
    try { setData(await call('reminders')); } catch {}
  }
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        load();
      }
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const count = data ? (data.dueToday.length + data.overdue.length + data.followUpsToday.length + data.followUpsOverdue.length) : 0;
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} className="px-2 sm:px-3 h-9 flex items-center gap-1.5 cursor-pointer">
        <Bell className="w-4 h-4" />
        <span className="hidden sm:inline">Reminders</span>
        {count > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{count}</span>}
      </Button>
      {open && data && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-lg shadow-xl z-50 max-h-[70vh] overflow-y-auto">
          <div className="p-3 border-b dark:border-slate-800 font-semibold flex items-center justify-between">
            <span className="text-slate-900 dark:text-slate-100">Reminders</span>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>✕</Button>
          </div>
          <ReminderSection title="🔴 Overdue Tasks" items={data.overdue} kind="task" setView={(id) => { setView('tasks', { openId: id }); setOpen(false); }} />
          <ReminderSection title="🟡 Tasks Due Today" items={data.dueToday} kind="task" setView={(id) => { setView('tasks', { openId: id }); setOpen(false); }} />
          <ReminderSection title="🟢 Tasks Upcoming (7 days)" items={data.upcoming} kind="task" setView={(id) => { setView('tasks', { openId: id }); setOpen(false); }} />
          <ReminderSection title="📞 Follow-ups Overdue" items={data.followUpsOverdue} kind="lead" setView={(id) => { setView('leads', { openId: id }); setOpen(false); }} />
          <ReminderSection title="📞 Follow-ups Today" items={data.followUpsToday} kind="lead" setView={(id) => { setView('leads', { openId: id }); setOpen(false); }} />
          <ReminderSection title="📞 Follow-ups Upcoming" items={data.followUpsUpcoming} kind="lead" setView={(id) => { setView('leads', { openId: id }); setOpen(false); }} />
          {count === 0 && <div className="p-6 text-center text-sm text-slate-500">All caught up! 🎉</div>}
        </div>
      )}
    </div>
  );
}

function ReminderSection({ title, items, setView, kind }) {
  if (!items?.length) return null;
  const isLead = kind === 'lead';
  return (
    <div className="border-b dark:border-slate-800">
      <div className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50">{title} ({items.length})</div>
      {items.slice(0, 5).map(it => (
        <button key={it.id} onClick={() => setView(it.id)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
          <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{isLead ? it.name : it.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isLead ? `${it.serviceType} • Follow-up: ${it.followUpDate}` : `${it.category} • Due: ${it.dueDate}`}
          </div>
        </button>
      ))}
    </div>
  );
}

function TelegramBanner({ user, onOpenProfile }) {
  if (user?.telegramChatId) return null;
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 dark:from-slate-900 dark:to-slate-950/50 border border-indigo-200/80 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-indigo-600 text-white rounded-lg shrink-0 shadow-sm">
          <Send className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
            Connect Telegram Notification System 🤖
          </h4>
          <p className="text-xs text-indigo-850 dark:text-slate-400 mt-0.5 leading-relaxed max-w-2xl">
            Never miss an update. Receive instant alerts for task assignments, lead allocation, and your daily performance PDF roster directly on Telegram.
          </p>
        </div>
      </div>
      <Button 
        size="sm" 
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shrink-0 cursor-pointer self-start sm:self-center shadow-sm"
        onClick={onOpenProfile}
      >
        <Send className="w-3.5 h-3.5 mr-1.5" /> Connect Now
      </Button>
    </div>
  );
}

function Dashboard({ user, setView, onOpenProfile }) {
  const { call } = useApi();
  const [data, setData] = useState(null);

  async function load() {
    try { setData(await call('dashboard')); } catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  if (!data) return <div className="text-slate-500">Loading dashboard...</div>;

  if (data.role === 'staff') {
    const s = data.stats;
    const cards = [
      { label: 'My Tasks', value: s.allMine, icon: ListChecks, color: 'bg-indigo-50 text-indigo-600 border border-indigo-100/50', goto: () => setView('tasks', { assignedTo: user.id }) },
      { label: 'Pending', value: s.pending, icon: Clock, color: 'bg-amber-50 text-amber-600 border border-amber-100/50', goto: () => setView('tasks', { status: 'Pending', assignedTo: user.id }) },
      { label: 'Due Today', value: s.dueToday, icon: Calendar, color: 'bg-blue-50 text-blue-600 border border-blue-100/50', goto: () => setView('calendar') },
      { label: 'Overdue', value: s.overdue, icon: AlertTriangle, color: 'bg-red-50 text-red-600 border border-red-100/50', goto: () => setView('tasks', { status: 'overdue', assignedTo: user.id }) },
      { label: 'In Progress', value: s.inProg, icon: TrendingUp, color: 'bg-violet-50 text-violet-600 border border-violet-100/50', goto: () => setView('tasks', { status: 'In Progress', assignedTo: user.id }) },
      { label: 'Completed', value: s.done, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50', goto: () => setView('tasks', { status: 'Completed', assignedTo: user.id }) },
    ];
    return (
      <div className="space-y-6">
        <PageHeader title={`Welcome, ${user.name}`} subtitle="Your tasks at a glance" />
        <TelegramBanner user={user} onOpenProfile={onOpenProfile} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {cards.map(c => <StatCard key={c.label} {...c} />)}
        </div>
        <AwaitingDiscussionWidget
          items={data.awaitingDiscussion || []}
          role="staff"
          setView={setView}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Tasks</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setView('tasks')}>View all <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </CardHeader>
          <CardContent><RecentTasksList tasks={data.recentTasks} setView={setView} /></CardContent>
        </Card>
      </div>
    );
  }

  const l = data.leads, t = data.tasks;
  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.name}`} subtitle="Practice overview — click any card or row to drill down" />
      <TelegramBanner user={user} onOpenProfile={onOpenProfile} />
      <div>
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-wider"><Target className="w-4 h-4" /> LEADS</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total" value={l.total} icon={Target} color="bg-slate-50 text-slate-600 border border-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" goto={() => setView('leads')} />
          <StatCard label="New" value={l.new} icon={Sparkles} color="bg-blue-50 text-blue-600 border border-blue-100/50 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/30" goto={() => setView('leads', { status: 'New' })} />
          <StatCard label="In Progress" value={l.inProgress} icon={TrendingUp} color="bg-amber-50 text-amber-600 border border-amber-100/50 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/30" goto={() => setView('leads', { status: 'In Progress' })} />
          <StatCard label="Converted" value={l.converted} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600 border border-emerald-100/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30" goto={() => setView('leads', { status: 'Converted' })} />
          <StatCard label="Cancelled" value={l.cancelled} icon={AlertTriangle} color="bg-red-50 text-red-600 border border-red-100/50 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/30" goto={() => setView('leads', { status: 'Cancelled' })} />
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-wider"><ListChecks className="w-4 h-4" /> TASKS</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total" value={t.total} icon={ListChecks} color="bg-slate-50 text-slate-600 border border-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" goto={() => setView('tasks')} />
          <StatCard label="Pending" value={t.pending} icon={Clock} color="bg-amber-50 text-amber-600 border border-amber-100/50 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/30" goto={() => setView('tasks', { status: 'Pending' })} />
          <StatCard label="In Progress" value={t.inProgress} icon={TrendingUp} color="bg-violet-50 text-violet-600 border border-violet-100/50 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-900/30" goto={() => setView('tasks', { status: 'In Progress' })} />
          <StatCard label="Completed" value={t.completed} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600 border border-emerald-100/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30" goto={() => setView('tasks', { status: 'Completed' })} />
          <StatCard label="Overdue" value={t.overdue} icon={AlertTriangle} color="bg-red-50 text-red-600 border border-red-100/50 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/30" goto={() => setView('tasks', { status: 'overdue' })} />
        </div>
      </div>
      <AwaitingDiscussionWidget
        items={data.awaitingDiscussion || []}
        role={data.role}
        setView={setView}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Staff Performance</CardTitle>
            {user.role === 'admin' && (
              <Button size="sm" variant="ghost" onClick={() => setView('users')}>
                View all <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Done</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.staffPerformance.map(s => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setView('tasks', { assignedTo: s.id })}>
                    <TableCell className="font-medium text-indigo-600">{s.name}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{s.role}</Badge></TableCell>
                    <TableCell className="text-right">{s.assigned}</TableCell>
                    <TableCell className="text-right text-emerald-600 hover:underline" onClick={(e) => { e.stopPropagation(); setView('tasks', { assignedTo: s.id, status: 'Completed' }); }}>{s.done}</TableCell>
                    <TableCell className="text-right text-amber-600 hover:underline" onClick={(e) => { e.stopPropagation(); setView('tasks', { assignedTo: s.id, status: 'Pending' }); }}>{s.pending}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="leads">
              <TabsList>
                <TabsTrigger value="leads">Leads</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
              </TabsList>
              <TabsContent value="leads" className="mt-3">
                <ul className="space-y-2">
                  {data.recentLeads.map(l => (
                    <li key={l.id} onClick={() => setView('leads', { openId: l.id })} className="flex items-center justify-between text-sm border-b pb-2 cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1 rounded">
                      <div>
                        <div className="font-medium text-indigo-600 hover:underline">{l.name}</div>
                        <div className="text-xs text-slate-500">{l.serviceType} • {l.source}</div>
                      </div>
                      <StatusBadge status={l.status} />
                    </li>
                  ))}
                  {!data.recentLeads.length && <li className="text-sm text-slate-500">No leads yet.</li>}
                </ul>
                <div className="mt-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setView('leads')}>View all leads <ChevronRight className="w-4 h-4 ml-1" /></Button>
                </div>
              </TabsContent>
              <TabsContent value="tasks" className="mt-3">
                <RecentTasksList tasks={data.recentTasks} setView={setView} />
                <div className="mt-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setView('tasks')}>View all tasks <ChevronRight className="w-4 h-4 ml-1" /></Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


function AwaitingDiscussionWidget({ items, role, setView }) {
  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-600" />
            {role === 'staff' ? 'My Discussions in Progress' : 'Tasks Awaiting My Discussion'}
            <Badge variant="outline" className="ml-1">0</Badge>
          </CardTitle>
          <CardDescription>
            {role === 'staff'
              ? 'Tasks you flagged for guidance from an admin / manager. None pending.'
              : 'Tasks where a staff member is awaiting your input. All clear!'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function openTask(t) {
    setView('tasks', { openId: t.id, discussion: role === 'staff' ? 'mine' : 'me' });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <Card className="border-l-4 border-l-amber-400">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-600" />
              {role === 'staff' ? 'My Discussions in Progress' : 'Tasks Awaiting My Discussion'}
              <Badge className="bg-amber-500 hover:bg-amber-600">{items.length}</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {role === 'staff'
                ? "Tasks you've flagged for guidance — still awaiting a manager / admin response."
                : 'Staff have flagged these tasks for your input — please review and resolve.'}
            </CardDescription>
          </div>
          {role !== 'staff' && (
            <Button size="sm" variant="outline" onClick={() => setView('tasks', { discussion: 'me' })}>
              View all in Tasks <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y border rounded-md overflow-hidden">
          {items.map(t => (
            <button
              key={t.id}
              onClick={() => openTask(t)}
              className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-800 truncate">{t.title}</span>
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {t.clientName && <span>Client: {t.clientName}</span>}
                  {t.discussionRaisedByName && role !== 'staff' && (
                    <span>🗣️ Raised by <b>{t.discussionRaisedByName}</b></span>
                  )}
                  {t.discussionRaisedAt && <span>{fmtDate(t.discussionRaisedAt)}</span>}
                  {t.dueDate && <span>Due {new Date(t.dueDate).toLocaleDateString()}</span>}
                  {(t.comments?.length > 0) && (
                    <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" /> {t.comments.length}</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon: Icon, color, goto }) {
  return (
    <Card
      onClick={goto}
      className={`transition group ${goto ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-300 dark:hover:border-indigo-800' : ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
          <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
        {goto && <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium mt-1 group-hover:underline">View details →</div>}
      </CardContent>
    </Card>
  );
}

function RecentTasksList({ tasks, setView }) {
  if (!tasks?.length) return <div className="text-sm text-slate-500">No tasks yet.</div>;
  return (
    <ul className="space-y-2">
      {tasks.map(t => (
        <li key={t.id} onClick={() => setView && setView('tasks', { openId: t.id })} className={`flex items-center justify-between text-sm border-b dark:border-slate-800 pb-2 ${setView ? 'cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1 rounded' : ''}`}>
          <div>
            <div className={`font-medium ${setView ? 'text-indigo-600 dark:text-indigo-400 hover:underline hover:text-indigo-850 dark:hover:text-indigo-300' : ''}`}>{t.title}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t.category} • Due {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '-'}</div>
          </div>
          <div className="flex gap-2 items-center">
            <PriorityBadge priority={t.priority} />
            <StatusBadge status={t.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-2">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    'New': 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border dark:border-blue-900/30',
    'In Progress': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border dark:border-amber-900/30',
    'Converted': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border dark:border-emerald-900/30',
    'Cancelled': 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 dark:border dark:border-red-900/30',
    'Pending': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700',
    'Completed': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border dark:border-emerald-900/30',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{status}</span>;
}

function PriorityBadge({ priority }) {
  const map = {
    Low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700',
    Medium: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border dark:border-blue-900/30',
    High: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 dark:border dark:border-orange-900/30',
    Urgent: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 dark:border dark:border-red-900/30',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[priority] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{priority}</span>;
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <Label className="text-xs text-slate-600 mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Leads({ user, viewParams = {}, setView }) {
  const { call } = useApi();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState(viewParams.status || 'all');
  const [serviceFilter, setServiceFilter] = useState(viewParams.serviceType || 'all');
  const [assignedFilter, setAssignedFilter] = useState(viewParams.assignedTo || 'all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [convertOpen, setConvertOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const canCreate = true; // all roles, including staff
  function canEditLead(l) { return user.role !== 'staff' || l.assignedTo === user.id; }
  function canDeleteLead() { return user.role !== 'staff'; }

  async function load(currentPage = page) {
    try {
      let url = `leads?page=${currentPage}&limit=25`;
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      if (serviceFilter !== 'all') url += `&serviceType=${serviceFilter}`;
      if (assignedFilter !== 'all') url += `&assignedTo=${assignedFilter}`;

      const [l, u] = await Promise.all([call(url), call('users')]);
      setLeads(l.leads || []);
      setTotalItems(l.total || 0);
      setUsers(u.users || []);

      if (viewParams.openId) {
        let f = (l.leads || []).find(x => x.id === viewParams.openId);
        if (f) {
          setDetail(f);
        } else {
          try {
            const res = await call(`leads?id=${viewParams.openId}`);
            if (res.leads && res.leads[0]) {
              setDetail(res.leads[0]);
            }
          } catch {}
        }
      }
    } catch (e) { toast.error(e.message); }
  }

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, serviceFilter, assignedFilter]);

  // Load data when page, filters, or openId changes
  useEffect(() => {
    load(page);
  }, [page, statusFilter, serviceFilter, assignedFilter, viewParams.openId]);
  useEffect(() => {
    if (viewParams.status) setStatusFilter(viewParams.status);
    if (viewParams.serviceType) setServiceFilter(viewParams.serviceType);
    if (viewParams.assignedTo) setAssignedFilter(viewParams.assignedTo);
  }, [viewParams.status, viewParams.serviceType, viewParams.assignedTo]);

  const filtered = useMemo(() => {
    const list = leads.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (serviceFilter !== 'all' && l.serviceType !== serviceFilter) return false;
      if (assignedFilter !== 'all' && l.assignedTo !== assignedFilter) return false;
      if (q && !`${l.name} ${l.company} ${l.phone} ${l.email}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      } else if (sortField === 'contact') {
        valA = (a.phone || '').toLowerCase();
        valB = (b.phone || '').toLowerCase();
      } else if (sortField === 'serviceType') {
        valA = (a.serviceType || '').toLowerCase();
        valB = (b.serviceType || '').toLowerCase();
      } else if (sortField === 'source') {
        valA = (a.source || '').toLowerCase();
        valB = (b.source || '').toLowerCase();
      } else if (sortField === 'status') {
        valA = (a.status || '').toLowerCase();
        valB = (b.status || '').toLowerCase();
      } else if (sortField === 'assignedTo') {
        const nameA = users.find(u => u.id === a.assignedTo)?.name || '';
        const nameB = users.find(u => u.id === b.assignedTo)?.name || '';
        valA = nameA.toLowerCase();
        valB = nameB.toLowerCase();
      } else if (sortField === 'followUpDate') {
        valA = a.followUpDate || '';
        valB = b.followUpDate || '';
      } else if (sortField === 'createdAt') {
        valA = a.createdAt || '';
        valB = b.createdAt || '';
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [leads, q, statusFilter, serviceFilter, assignedFilter, sortField, sortOrder, users]);

  function userName(id) { return users.find(u => u.id === id)?.name || '-'; }

  async function deleteLead(id) {
    if (!confirm('Delete this lead?')) return;
    try { await call(`leads/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }

  function doExport() {
    const rows = filtered.map(l => ({
      Name: l.name, Phone: l.phone, Email: l.email, Company: l.company,
      Service: l.serviceType, Source: l.source, Status: l.status,
      AssignedTo: userName(l.assignedTo), FollowUp: l.followUpDate, CreatedAt: l.createdAt,
    }));
    exportToExcel(rows, `leads_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${rows.length} leads`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        subtitle={`${filtered.length} of ${totalItems} leads`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={doExport}><FileSpreadsheet className="w-4 h-4 mr-2" />Export Excel</Button>
            {canCreate && (<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New Lead</Button>)}
          </div>
        }
      />
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input placeholder="Search name, company, phone..." value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger><SelectValue placeholder="Assigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">
                    Name
                    {sortField === 'name' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('contact')}>
                  <div className="flex items-center gap-1">
                    Contact
                    {sortField === 'contact' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('serviceType')}>
                  <div className="flex items-center gap-1">
                    Service
                    {sortField === 'serviceType' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('source')}>
                  <div className="flex items-center gap-1">
                    Source
                    {sortField === 'source' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">
                    Status
                    {sortField === 'status' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('assignedTo')}>
                  <div className="flex items-center gap-1">
                    Assigned
                    {sortField === 'assignedTo' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('followUpDate')}>
                  <div className="flex items-center gap-1">
                    Follow-up
                    {sortField === 'followUpDate' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(l => (
                <TableRow key={l.id} className="hover:bg-slate-50">
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => setDetail(l)} className="font-medium text-indigo-600 hover:underline text-left">{l.name}</button>
                      {(l.notes?.length > 0) && (
                        <button
                          onClick={() => setDetail(l)}
                          title={`${l.notes.length} note${l.notes.length === 1 ? '' : 's'}`}
                          className="inline-flex items-center gap-0.5 text-[11px] text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-full px-1.5 py-0.5 transition"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span className="leading-none">{l.notes.length}</span>
                        </button>
                      )}
                    </div>
                    {l.company && <div className="text-xs text-slate-500">{l.company}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{l.phone}</div>
                    {l.email && <div className="text-xs text-slate-500">{l.email}</div>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{l.serviceType}</Badge></TableCell>
                  <TableCell><span className="text-sm text-slate-600">{l.source}</span></TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                  <TableCell className="text-sm">{userName(l.assignedTo)}</TableCell>
                  <TableCell className="text-sm">{l.followUpDate ? new Date(l.followUpDate).toLocaleDateString() : '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {canEditLead(l) && l.status !== 'Converted' && user.role !== 'staff' && (
                        <Button size="sm" variant="ghost" onClick={() => setConvertOpen(l)} title="Convert to task"><ArrowRight className="w-4 h-4" /></Button>
                      )}
                      {canEditLead(l) && (<Button size="sm" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}><Edit className="w-4 h-4" /></Button>)}
                      {canDeleteLead() && (<Button size="sm" variant="ghost" onClick={() => deleteLead(l.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No leads found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination
            currentPage={page}
            totalItems={totalItems}
            limit={25}
            onPageChange={(p) => setPage(p)}
            className="-mx-6 -mb-6 mt-4 border-t"
          />
        </CardContent>
      </Card>

      {open && (<LeadForm users={users} initial={editing} currentUser={user} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />)}
      {convertOpen && (<ConvertLeadDialog lead={convertOpen} users={users} onClose={() => setConvertOpen(null)} onDone={() => { setConvertOpen(null); load(); }} />)}
      {detail && (<LeadDetail lead={detail} users={users} onClose={() => { setDetail(null); setView('leads', {}); }} onChanged={async () => { const d = await call(`leads?id=${detail.id}`); const f = d.leads?.[0] || d.data?.[0]; if (f) setDetail(f); load(); }} canEdit={canEditLead(detail)} />)}
    </div>
  );
}

function LeadForm({ users, initial, onClose, onSaved, currentUser }) {
  const { call } = useApi();
  const [f, setF] = useState(initial || {
    name: '', phone: '', email: '', company: '',
    serviceType: 'GST', source: 'Referral', status: 'New',
    assignedTo: currentUser?.id || '', followUpDate: '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try {
      if (initial) { await call(`leads/${initial.id}`, { method: 'PUT', body: f }); toast.success('Lead updated'); }
      else { await call('leads', { method: 'POST', body: f }); toast.success('Lead created'); }
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>{initial ? 'Edit Lead' : 'New Lead'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Client Name *"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Phone *"><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} required /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Company"><Input value={f.company} onChange={e => setF({ ...f, company: e.target.value })} /></Field>
          <Field label="Service Type">
            <Select value={f.serviceType} onValueChange={v => setF({ ...f, serviceType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Source">
            <Select value={f.source} onValueChange={v => setF({ ...f, source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onValueChange={v => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Assigned To">
            <Select value={f.assignedTo || 'none'} onValueChange={v => setF({ ...f, assignedTo: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}{u.id === currentUser?.id ? ' (you)' : ''} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Follow-up Date" className="md:col-span-2">
            <Input type="date" value={f.followUpDate ? f.followUpDate.slice(0, 10) : ''} onChange={e => setF({ ...f, followUpDate: e.target.value })} />
          </Field>
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Lead'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConvertLeadDialog({ lead, users, onClose, onDone }) {
  const { call } = useApi();
  const [f, setF] = useState({
    title: `${lead.serviceType} work for ${lead.name}`,
    description: '',
    category: lead.serviceType,
    priority: 'Medium',
    dueDate: '',
    assignedTo: lead.assignedTo || '',
  });
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try {
      await call('leads/convert', { method: 'POST', body: { leadId: lead.id, ...f } });
      toast.success('Lead converted to task');
      onDone();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert Lead → Task</DialogTitle>
          <DialogDescription>Create work item for <strong>{lead.name}</strong></DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Task Title *"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} required /></Field>
          <Field label="Description"><Textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={f.category} onValueChange={v => setF({ ...f, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_CATEGORIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={f.priority} onValueChange={v => setF({ ...f, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Due Date"><Input type="date" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} /></Field>
            <Field label="Assign To">
              <Select value={f.assignedTo || 'none'} onValueChange={v => setF({ ...f, assignedTo: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Converting...' : 'Convert to Task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeadDetail({ lead, users, onClose, onChanged, canEdit }) {
  const { call } = useApi();
  const [note, setNote] = useState('');
  function userName(id) { return users.find(u => u.id === id)?.name || '-'; }
  async function addNote() {
    if (!note.trim()) return;
    try { await call(`leads/${lead.id}/notes`, { method: 'PUT', body: { note } }); setNote(''); toast.success('Note added'); onChanged(); }
    catch (e) { toast.error(e.message); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{lead.name} <StatusBadge status={lead.status} /></DialogTitle>
          <DialogDescription>{lead.company || 'Individual client'} • {lead.phone} {lead.email ? `• ${lead.email}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Service" value={lead.serviceType} />
          <Info label="Source" value={lead.source} />
          <Info label="Assigned To" value={userName(lead.assignedTo)} />
          <Info label="Follow-up" value={lead.followUpDate ? new Date(lead.followUpDate).toLocaleDateString() : '-'} />
          <Info label="Created" value={new Date(lead.createdAt).toLocaleString()} />
          <Info label="Updated" value={new Date(lead.updatedAt).toLocaleString()} />
        </div>
        <Separator />
        <div>
          <div className="font-semibold mb-2">Follow-up Notes</div>
          <ScrollArea className="h-48 border rounded-md p-2">
            {(lead.notes || []).length === 0 && <div className="text-sm text-slate-500">No notes yet.</div>}
            {(lead.notes || []).map(n => (
              <div key={n.id} className="text-sm border-b pb-2 mb-2">
                <div>{n.text}</div>
                <div className="text-xs text-slate-500">{n.by} • {new Date(n.at).toLocaleString()}</div>
              </div>
            ))}
          </ScrollArea>
          {canEdit && (
            <div className="flex gap-2 mt-2">
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Add follow-up note..." />
              <Button onClick={addNote}>Add</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Tasks({ user, viewParams = {}, setView }) {
  const { call } = useApi();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState(viewParams.status || 'all');
  const [priorityFilter, setPriorityFilter] = useState(viewParams.priority || 'all');
  const [categoryFilter, setCategoryFilter] = useState(viewParams.category || 'all');
  const [assignedFilter, setAssignedFilter] = useState(viewParams.assignedTo || 'all');
  const [discussionFilter, setDiscussionFilter] = useState(viewParams.discussion || 'all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQ(q);
    }, 300);
    return () => clearTimeout(handler);
  }, [q]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const canCreate = true; // All roles can create tasks (staff auto-assigns to self)
  const canEditAny = user.role !== 'staff'; // Only managers/admins can edit any task fully
  function canEditTask(t) {
    if (canEditAny) return true;
    // Staff can edit their own tasks
    return t.assignedTo === user.id;
  }
  function canDeleteTask() { return canEditAny; }

  async function load(currentPage = page) {
    try {
      let url = `tasks?page=${currentPage}&limit=25`;
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      if (priorityFilter !== 'all') url += `&priority=${priorityFilter}`;
      if (categoryFilter !== 'all') url += `&category=${categoryFilter}`;
      if (assignedFilter !== 'all') url += `&assignedTo=${assignedFilter}`;
      if (discussionFilter !== 'all') url += `&discussion=${discussionFilter}`;
      if (debouncedQ && debouncedQ.trim()) url += `&q=${encodeURIComponent(debouncedQ.trim())}`;

      const [t, u] = await Promise.all([call(url), call('users')]);
      setTasks(t.tasks || []);
      setTotalItems(t.total || 0);
      setUsers(u.users || []);

      if (viewParams.openId) {
        let f = (t.tasks || []).find(x => x.id === viewParams.openId);
        if (f) {
          setDetail(f);
        } else {
          try {
            const res = await call(`tasks?id=${viewParams.openId}`);
            if (res.tasks && res.tasks[0]) {
              setDetail(res.tasks[0]);
            }
          } catch {}
        }
      }
    } catch (e) { toast.error(e.message); }
  }

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, categoryFilter, assignedFilter, discussionFilter, debouncedQ]);

  // Load data when page, filters, or openId changes
  useEffect(() => {
    load(page);
  }, [page, statusFilter, priorityFilter, categoryFilter, assignedFilter, discussionFilter, debouncedQ, viewParams.openId]);
  useEffect(() => {
    if (viewParams.status) setStatusFilter(viewParams.status);
    if (viewParams.priority) setPriorityFilter(viewParams.priority);
    if (viewParams.category) setCategoryFilter(viewParams.category);
    if (viewParams.assignedTo) setAssignedFilter(viewParams.assignedTo);
    if (viewParams.discussion) setDiscussionFilter(viewParams.discussion);
  }, [viewParams.status, viewParams.priority, viewParams.category, viewParams.assignedTo, viewParams.discussion]);

  function userName(id) { return users.find(u => u.id === id)?.name || '-'; }
  function isOverdue(t) {
    if (t.status === 'Completed' || !t.dueDate) return false;
    return new Date(t.dueDate) < new Date(new Date().setHours(0,0,0,0));
  }
  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const list = tasks.filter(t => {
      if (statusFilter === 'overdue') {
        if (t.status === 'Completed') return false;
        if (!t.dueDate || new Date(t.dueDate) >= today) return false;
      } else if (statusFilter === 'action') {
        if (t.status === 'Completed') return false;
      } else if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (assignedFilter !== 'all' && t.assignedTo !== assignedFilter) return false;
      if (discussionFilter === 'me') {
        if (!t.needsDiscussion || t.discussionWith !== user.id) return false;
      } else if (discussionFilter === 'any') {
        if (!t.needsDiscussion) return false;
      }
      if (debouncedQ && !`${t.title} ${t.description} ${t.clientName || ''}`.toLowerCase().includes(debouncedQ.toLowerCase())) return false;
      return true;
    });

    const priorityOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };

    return [...list].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'title') {
        valA = (a.title || '').toLowerCase();
        valB = (b.title || '').toLowerCase();
      } else if (sortField === 'category') {
        valA = (a.category || '').toLowerCase();
        valB = (b.category || '').toLowerCase();
      } else if (sortField === 'priority') {
        const orderA = priorityOrder[a.priority] || 4;
        const orderB = priorityOrder[b.priority] || 4;
        return sortOrder === 'asc' ? orderA - orderB : orderB - orderA;
      } else if (sortField === 'status') {
        valA = (a.status || '').toLowerCase();
        valB = (b.status || '').toLowerCase();
      } else if (sortField === 'dueDate') {
        valA = a.dueDate || '9999-99-99';
        valB = b.dueDate || '9999-99-99';
      } else if (sortField === 'assignedTo') {
        const nameA = userName(a.assignedTo) || '';
        const nameB = userName(b.assignedTo) || '';
        valA = nameA.toLowerCase();
        valB = nameB.toLowerCase();
      } else if (sortField === 'createdAt') {
        valA = a.createdAt || '';
        valB = b.createdAt || '';
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tasks, debouncedQ, statusFilter, priorityFilter, categoryFilter, assignedFilter, discussionFilter, sortField, sortOrder, users]);

  async function deleteTask(id) {
    if (!confirm('Delete task?')) return;
    try { await call(`tasks/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }
  async function quickStatus(t, status) {
    try { await call(`tasks/${t.id}`, { method: 'PUT', body: { status } }); load(); toast.success(`Marked ${status}`); }
    catch (e) { toast.error(e.message); }
  }
  function doExport() {
    const rows = filtered.map(t => ({
      Title: t.title, Category: t.category, Priority: t.priority, Status: t.status,
      DueDate: t.dueDate, AssignedTo: userName(t.assignedTo), Client: t.clientName || '',
      Description: t.description, CreatedAt: t.createdAt,
    }));
    exportToExcel(rows, `tasks_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${rows.length} tasks`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        subtitle={`${filtered.length} of ${totalItems} tasks`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={doExport}><FileSpreadsheet className="w-4 h-4 mr-2" />Export Excel</Button>
            {canCreate && (<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New Task</Button>)}
          </div>
        }
      />
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input placeholder="Search tasks..." value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="action">✨ Action Required (not completed)</SelectItem>
                {TASK_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {TASK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger><SelectValue placeholder="Assigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={discussionFilter} onValueChange={setDiscussionFilter}>
              <SelectTrigger><SelectValue placeholder="Discussion" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tasks</SelectItem>
                <SelectItem value="me">🗣️ Awaiting my input</SelectItem>
                <SelectItem value="any">🗣️ Any discussion needed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('title')}>
                  <div className="flex items-center gap-1">
                    Title
                    {sortField === 'title' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('category')}>
                  <div className="flex items-center gap-1">
                    Category
                    {sortField === 'category' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('priority')}>
                  <div className="flex items-center gap-1">
                    Priority
                    {sortField === 'priority' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">
                    Status
                    {sortField === 'status' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('dueDate')}>
                  <div className="flex items-center gap-1">
                    Due
                    {sortField === 'dueDate' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-100/50 transition py-3" onClick={() => handleSort('assignedTo')}>
                  <div className="flex items-center gap-1">
                    Assigned
                    {sortField === 'assignedTo' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => (
                <TableRow key={t.id} className={`hover:bg-slate-50 ${isOverdue(t) ? 'bg-red-50/50' : ''} ${t.needsDiscussion ? 'border-l-4 border-l-amber-400' : ''}`}>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => setDetail(t)} className="font-medium text-indigo-600 hover:underline text-left">{t.title}</button>
                      {(t.comments?.length > 0) && (
                        <button
                          onClick={() => setDetail(t)}
                          title={`${t.comments.length} comment${t.comments.length === 1 ? '' : 's'}`}
                          className="inline-flex items-center gap-0.5 text-[11px] text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-full px-1.5 py-0.5 transition"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span className="leading-none">{t.comments.length}</span>
                        </button>
                      )}
                    </div>
                    {t.clientName && <div className="text-xs text-slate-500">Client: {t.clientName}</div>}
                    {t.needsDiscussion && (
                      <div className="text-[10px] text-amber-700 mt-0.5 inline-flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 rounded mt-1">
                        🗣️ Discussion: {userName(t.discussionWith)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-sm">
                    {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '-'}
                    {isOverdue(t) && <div className="text-xs text-red-600 font-semibold">OVERDUE</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(() => {
                      const ids = (t.assignees && t.assignees.length) ? t.assignees : (t.assignedTo ? [t.assignedTo] : []);
                      if (!ids.length) return '-';
                      const names = ids.map(userName);
                      if (names.length === 1) return names[0];
                      return <span title={names.join(', ')}>{names[0]} <Badge variant="outline" className="ml-1">+{names.length - 1}</Badge></span>;
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {t.status !== 'Completed' && (<Button size="sm" variant="ghost" onClick={() => quickStatus(t, 'Completed')} title="Mark complete"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></Button>)}
                      {canEditTask(t) && (<Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }} title="Edit task"><Edit className="w-4 h-4" /></Button>)}
                      {canDeleteTask() && (<Button size="sm" variant="ghost" onClick={() => deleteTask(t.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (<TableRow><TableCell colSpan={7} className="text-center text-slate-500 py-8">No tasks found.</TableCell></TableRow>)}
            </TableBody>
          </Table>
          <Pagination
            currentPage={page}
            totalItems={totalItems}
            limit={25}
            onPageChange={(p) => setPage(p)}
            className="-mx-6 -mb-6 mt-4 border-t"
          />
        </CardContent>
      </Card>
      {open && (<TaskForm users={users} initial={editing} currentUser={user} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />)}
      {detail && (<TaskDetail task={detail} users={users} currentUser={user} onClose={() => { setDetail(null); setView('tasks', {}); }} onChanged={async () => { const d = await call(`tasks?id=${detail.id}`); const f = d.tasks?.[0] || d.data?.[0]; if (f) setDetail(f); load(); }} />)}
    </div>
  );
}

function TaskForm({ users, initial, onClose, onSaved, currentUser }) {
  const { call } = useApi();
  const [f, setF] = useState(initial ? {
    ...initial,
    needsDiscussion: !!initial.needsDiscussion,
    discussionWith: initial.discussionWith || '',
    recurrence: initial.recurrence || 'none',
    assignees: (initial.assignees && initial.assignees.length) ? initial.assignees : (initial.assignedTo ? [initial.assignedTo] : []),
  } : {
    title: '', description: '', category: 'Tax', priority: 'Medium',
    dueDate: '', assignedTo: currentUser?.id || '', assignees: currentUser?.id ? [currentUser.id] : [],
    clientName: '', recurrence: 'none',
    needsDiscussion: false, discussionWith: '',
  });
  const seniors = (users || []).filter(u => u.role === 'admin' || u.role === 'manager');
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try {
      if (initial) { await call(`tasks/${initial.id}`, { method: 'PUT', body: f }); toast.success('Task updated'); }
      else { await call('tasks', { method: 'POST', body: f }); toast.success('Task created'); }
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title *"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} required /></Field>
          <Field label="Description"><Textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={3} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={f.category} onValueChange={v => setF({ ...f, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={f.priority} onValueChange={v => setF({ ...f, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Due Date"><Input type="date" value={f.dueDate ? f.dueDate.slice(0,10) : ''} onChange={e => setF({ ...f, dueDate: e.target.value })} /></Field>
            <Field label={`Assign To${f.assignees && f.assignees.length > 1 ? ` (${f.assignees.length})` : ''}`}>
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                {users.length === 0 && <div className="text-xs text-slate-400">No users available</div>}
                {users.map(u => {
                  const arr = f.assignees || (f.assignedTo ? [f.assignedTo] : []);
                  const checked = arr.includes(u.id);
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(arr);
                          if (e.target.checked) next.add(u.id); else next.delete(u.id);
                          const list = Array.from(next);
                          setF({ ...f, assignees: list, assignedTo: list[0] || '' });
                        }}
                      />
                      <span>
                        {u.name}
                        {isSelf && <span className="text-xs text-indigo-600 ml-1">(you)</span>}
                        <span className="text-xs text-slate-500 capitalize ml-1">({u.role})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>
            {initial && (
              <Field label="Status">
                <Select value={f.status} onValueChange={v => setF({ ...f, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
            <Field label="Client Name (optional)"><Input value={f.clientName || ''} onChange={e => setF({ ...f, clientName: e.target.value })} /></Field>
            <Field label="Recurrence">
              <Select value={f.recurrence || 'none'} onValueChange={v => setF({ ...f, recurrence: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (one-time)</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly (e.g., GSTR-3B)</SelectItem>
                  <SelectItem value="quarterly">Quarterly (e.g., Advance Tax)</SelectItem>
                  <SelectItem value="half-yearly">Half-Yearly</SelectItem>
                  <SelectItem value="yearly">Yearly (e.g., Audit)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="needsdisc" className="font-semibold text-amber-900 flex items-center gap-2">
                  🗣️ Needs discussion with manager / admin
                </Label>
                <p className="text-xs text-amber-700 mt-1">
                  Flag this task for guidance. It will appear in the selected manager/admin&apos;s task list with a discussion badge.
                </p>
              </div>
              <Switch id="needsdisc" checked={!!f.needsDiscussion} onCheckedChange={v => setF({ ...f, needsDiscussion: v, discussionWith: v ? f.discussionWith : '' })} />
            </div>
            {f.needsDiscussion && (
              <div className="mt-3">
                <Field label="Discuss with *">
                  <Select value={f.discussionWith || ''} onValueChange={v => setF({ ...f, discussionWith: v })}>
                    <SelectTrigger><SelectValue placeholder="Select admin or manager..." /></SelectTrigger>
                    <SelectContent>
                      {seniors.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetail({ task, users, currentUser, onClose, onChanged }) {
  const { call } = useApi();
  const [comment, setComment] = useState('');
  const [reassignTo, setReassignTo] = useState(task.assignedTo || '');
  function userName(id) { return users.find(u => u.id === id)?.name || '-'; }
  async function addComment() {
    if (!comment.trim()) return;
    try { await call(`tasks/${task.id}/comments`, { method: 'PUT', body: { comment } }); setComment(''); toast.success('Comment added'); onChanged(); }
    catch (e) { toast.error(e.message); }
  }
  async function setStatus(status) {
    try { await call(`tasks/${task.id}`, { method: 'PUT', body: { status } }); toast.success(`Marked ${status}`); onChanged(); }
    catch (e) { toast.error(e.message); }
  }
  async function resolveDiscussion(reassign) {
    try {
      const body = { needsDiscussion: false, discussionWith: '', discussionResolvedAt: new Date().toISOString(), discussionResolvedBy: currentUser?.id, discussionResolvedByName: currentUser?.name };
      if (reassign && reassignTo) body.assignedTo = reassignTo;
      await call(`tasks/${task.id}`, { method: 'PUT', body });
      toast.success(reassign ? 'Discussion resolved & task reassigned' : 'Discussion resolved');
      onChanged();
    } catch (e) { toast.error(e.message); }
  }
  const canResolveDiscussion = task.needsDiscussion && currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && task.discussionWith === currentUser.id;
  const canEditStatus = currentUser && (currentUser.role !== 'staff' || task.assignedTo === currentUser.id);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {task.title} <StatusBadge status={task.status} />
            {task.needsDiscussion && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">🗣️ Discussion: {userName(task.discussionWith)}</span>
            )}
          </DialogTitle>
          <DialogDescription>{task.description || 'No description'}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Info label="Category" value={task.category} />
          <Info label="Priority" value={task.priority} />
          <Info label="Due Date" value={task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'} />
          <Info label="Assigned To" value={userName(task.assignedTo)} />
          <Info label="Client" value={task.clientName || '-'} />
          <Info label="Created" value={`${new Date(task.createdAt).toLocaleString()}${task.createdByName ? ' by ' + task.createdByName : ''}`} />
          {task.recurrence && task.recurrence !== 'none' && <Info label="Recurrence" value={task.recurrence} />}
          {task.discussionRaisedByName && <Info label="Discussion raised by" value={task.discussionRaisedByName} />}
        </div>

        {canResolveDiscussion && (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
            <div className="font-semibold text-amber-900 flex items-center gap-2">🗣️ Awaiting your discussion</div>
            <p className="text-xs text-amber-800">
              Raised by <strong>{task.discussionRaisedByName || 'staff'}</strong>{task.discussionRaisedAt ? ` on ${new Date(task.discussionRaisedAt).toLocaleString()}` : ''}.
              Add comments below, then resolve and optionally re-assign back to a staff member.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Reassign to (optional)</Label>
                <Select value={reassignTo || 'keep'} onValueChange={v => setReassignTo(v === 'keep' ? task.assignedTo : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep current ({userName(task.assignedTo)})</SelectItem>
                    {users.filter(u => u.id !== task.assignedTo).map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => resolveDiscussion(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Resolve {reassignTo !== task.assignedTo ? '& Reassign' : ''}
                </Button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => resolveDiscussion(false)}>Mark Discussion Resolved (no reassign)</Button>
          </div>
        )}

        {canEditStatus && (
          <div className="flex gap-2 flex-wrap">
            {TASK_STATUSES.map(s => (
              <Button key={s} size="sm" variant={task.status === s ? 'default' : 'outline'} onClick={() => setStatus(s)}>{s}</Button>
            ))}
          </div>
        )}
        <Separator />
        <div>
          <div className="font-semibold mb-2">Comments</div>
          <ScrollArea className="h-40 border rounded-md p-2">
            {(task.comments || []).length === 0 && <div className="text-sm text-slate-500">No comments yet.</div>}
            {(task.comments || []).map(c => (
              <div key={c.id} className="text-sm border-b pb-2 mb-2">
                <div>{c.text}</div>
                <div className="text-xs text-slate-500">{c.by} • {new Date(c.at).toLocaleString()}</div>
              </div>
            ))}
          </ScrollArea>
          <div className="flex gap-2 mt-2">
            <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add comment..." />
            <Button onClick={addComment}>Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Quotations({ user, viewParams = {}, setView }) {
  const { call } = useApi();
  const [items, setItems] = useState([]);
  const [branding, setBranding] = useState({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sortField, setSortField] = useState('quotationNumber');
  const [sortOrder, setSortOrder] = useState('desc');

  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'servicesCount') {
        valA = (a.services || []).length;
        valB = (b.services || []).length;
      }
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc'
          ? (valA > valB ? 1 : -1)
          : (valB > valA ? 1 : -1);
      }
    });
  }, [items, sortField, sortOrder]);

  async function load(currentPage = page) {
    try {
      const [d, b] = await Promise.all([
        call(`quotations?page=${currentPage}&limit=25`),
        call('branding')
      ]);
      setItems(d.quotations || []);
      setTotalItems(d.total || 0);
      setBranding(b.branding || {});
      if (viewParams.openId) {
        let f = (d.quotations || []).find(x => x.id === viewParams.openId);
        if (f) {
          setEditing(f); setOpen(true);
        } else {
          try {
            const res = await call(`quotations?id=${viewParams.openId}`);
            if (res.quotations && res.quotations[0]) {
              setEditing(res.quotations[0]); setOpen(true);
            }
          } catch {}
        }
      }
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => {
    load(page);
  }, [page, viewParams.openId]);

  async function deleteQ(id) {
    if (!confirm('Delete quotation?')) return;
    try { await call(`quotations/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quotations"
        subtitle={`${sortedItems.length} of ${totalItems} quotations • Generate, edit and download professional PDF quotations`}
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New Quotation</Button>}
      />
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader label="Quotation #" field="quotationNumber" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Client" field="clientName" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Services" field="servicesCount" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Subtotal" field="subtotal" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="GST" field="gstAmount" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="Total" field="total" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="Date" field="createdAt" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map(q => (
                <TableRow key={q.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-sm">
                    <button onClick={() => { setEditing(q); setOpen(true); }} className="text-indigo-600 hover:underline">{q.quotationNumber}</button>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => { setEditing(q); setOpen(true); }} className="font-medium text-indigo-600 hover:underline text-left">{q.clientName}</button>
                    {q.companyName && <div className="text-xs text-slate-500">{q.companyName}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{(q.services || []).length} items</TableCell>
                  <TableCell className="text-right text-sm">₹{q.subtotal.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right text-sm">{q.gstApplicable ? `₹${q.gstAmount.toLocaleString('en-IN')}` : '-'}</TableCell>
                  <TableCell className="text-right font-semibold">₹{q.total.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(q.createdAt).toLocaleDateString()}
                    {q.updatedAt && q.updatedAt !== q.createdAt && (
                      <div className="text-[10px] text-amber-600">Edited {new Date(q.updatedAt).toLocaleDateString()}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(q); setOpen(true); }} title="Edit"><Edit className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => generateQuotationPDF(q, branding)} title="Download PDF"><FileDown className="w-4 h-4 text-indigo-600" /></Button>
                      {user.role !== 'staff' && (<Button size="sm" variant="ghost" onClick={() => deleteQ(q.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!sortedItems.length && (<TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No quotations yet. Create one to generate a PDF.</TableCell></TableRow>)}
            </TableBody>
          </Table>
          <Pagination
            currentPage={page}
            totalItems={totalItems}
            limit={25}
            onPageChange={(p) => setPage(p)}
            className="-mx-6 -mb-6 mt-4 border-t"
          />
        </CardContent>
      </Card>
      {open && <QuotationForm initial={editing} onClose={() => { setOpen(false); setEditing(null); setView('quotations', {}); }} onSaved={(q) => { setOpen(false); setEditing(null); setView('quotations', {}); load(); generateQuotationPDF(q, branding); }} />}
    </div>
  );
}

function QuotationForm({ initial, onClose, onSaved }) {
  const { call } = useApi();
  const [f, setF] = useState(initial ? {
    clientName: initial.clientName || '',
    companyName: initial.companyName || '',
    clientAddress: initial.clientAddress || '',
    clientEmail: initial.clientEmail || '',
    clientPhone: initial.clientPhone || '',
    services: initial.services || [],
    gstApplicable: !!initial.gstApplicable,
    validUntil: initial.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    terms: initial.terms || '',
    firmName: initial.firmName || '',
    firmAddress: initial.firmAddress || '',
    firmGstin: initial.firmGstin || '',
    firmContact: initial.firmContact || '',
  } : {
    clientName: '', companyName: '', clientAddress: '', clientEmail: '', clientPhone: '',
    services: [{ name: 'GST Return Filing (Monthly)', description: 'Monthly GST return filing & reconciliation', qty: 12, price: 2500 }],
    gstApplicable: true,
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    terms: 'Payment due within 15 days. Quotation valid for 30 days from issue date. All prices in INR.',
    firmName: '', firmAddress: '', firmGstin: '', firmContact: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) return; // don't override branding on edit
    call('branding').then(d => {
      const b = d.branding || {};
      setF(prev => ({
        ...prev,
        firmName: prev.firmName || b.firmName || 'ABC & Associates, Chartered Accountants',
        firmAddress: prev.firmAddress || b.firmAddress || '',
        firmGstin: prev.firmGstin || b.firmGstin || '',
        firmContact: prev.firmContact || b.firmContact || '',
      }));
    }).catch(() => {});
  }, []);
  function updateService(i, k, v) {
    const arr = [...f.services]; arr[i] = { ...arr[i], [k]: v }; setF({ ...f, services: arr });
  }
  function addService() { setF({ ...f, services: [...f.services, { name: '', description: '', qty: 1, price: 0 }] }); }
  function removeService(i) { setF({ ...f, services: f.services.filter((_, idx) => idx !== i) }); }

  const subtotal = f.services.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const gstAmount = f.gstApplicable ? +(subtotal * 0.18).toFixed(2) : 0;
  const total = +(subtotal + gstAmount).toFixed(2);

  async function submit(e) {
    e.preventDefault();
    if (!f.clientName) { toast.error('Client name required'); return; }
    if (!f.services.length) { toast.error('Add at least one service'); return; }
    setSaving(true);
    try {
      let d;
      if (initial) {
        d = await call(`quotations/${initial.id}`, { method: 'PUT', body: f });
        toast.success(`Quotation ${d.quotation.quotationNumber} updated!`);
      } else {
        d = await call('quotations', { method: 'POST', body: f });
        toast.success(`Quotation ${d.quotation.quotationNumber} created!`);
      }
      onSaved(d.quotation);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit Quotation ${initial.quotationNumber}` : 'New Quotation'}</DialogTitle>
          <DialogDescription>
            {initial
              ? 'Update services, prices or client details — totals will be recalculated and a fresh PDF will be downloaded.'
              : 'Fill in details — auto-generates branded PDF on save.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border p-4 bg-slate-50">
            <div className="font-semibold mb-3">Client Details</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client Name *"><Input value={f.clientName} onChange={e => setF({ ...f, clientName: e.target.value })} required /></Field>
              <Field label="Company Name"><Input value={f.companyName} onChange={e => setF({ ...f, companyName: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={f.clientEmail} onChange={e => setF({ ...f, clientEmail: e.target.value })} /></Field>
              <Field label="Phone"><Input value={f.clientPhone} onChange={e => setF({ ...f, clientPhone: e.target.value })} /></Field>
              <Field label="Address" className="col-span-2"><Input value={f.clientAddress} onChange={e => setF({ ...f, clientAddress: e.target.value })} /></Field>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Services</div>
              <Button type="button" size="sm" variant="outline" onClick={addService}><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            <div className="space-y-2">
              {f.services.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-3" placeholder="Service name" value={s.name} onChange={e => updateService(i, 'name', e.target.value)} />
                  <Input className="col-span-4" placeholder="Description" value={s.description} onChange={e => updateService(i, 'description', e.target.value)} />
                  <Input className="col-span-1" type="number" placeholder="Qty" value={s.qty} onChange={e => updateService(i, 'qty', e.target.value)} />
                  <Input className="col-span-2" type="number" placeholder="Price" value={s.price} onChange={e => updateService(i, 'price', e.target.value)} />
                  <div className="col-span-1 text-right text-sm font-medium">₹{((s.price || 0) * (s.qty || 1)).toLocaleString('en-IN')}</div>
                  <Button type="button" size="sm" variant="ghost" className="col-span-1" onClick={() => removeService(i)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={f.gstApplicable} onCheckedChange={v => setF({ ...f, gstApplicable: v })} id="gst" />
                <Label htmlFor="gst">Apply GST (18%)</Label>
              </div>
              <div className="text-right">
                <div className="text-sm">Subtotal: <span className="font-semibold">₹{subtotal.toLocaleString('en-IN')}</span></div>
                {f.gstApplicable && <div className="text-sm">GST: <span className="font-semibold">₹{gstAmount.toLocaleString('en-IN')}</span></div>}
                <div className="text-lg font-bold">Total: ₹{total.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border p-4 bg-slate-50">
            <div className="font-semibold mb-3">Firm & Terms</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Firm Name"><Input value={f.firmName} onChange={e => setF({ ...f, firmName: e.target.value })} /></Field>
              <Field label="Firm GSTIN"><Input value={f.firmGstin} onChange={e => setF({ ...f, firmGstin: e.target.value })} /></Field>
              <Field label="Firm Address" className="col-span-2"><Input value={f.firmAddress} onChange={e => setF({ ...f, firmAddress: e.target.value })} /></Field>
              <Field label="Firm Contact" className="col-span-2"><Input value={f.firmContact} onChange={e => setF({ ...f, firmContact: e.target.value })} /></Field>
              <Field label="Valid Until"><Input type="date" value={f.validUntil} onChange={e => setF({ ...f, validUntil: e.target.value })} /></Field>
            </div>
            <Field label="Terms & Notes" className="mt-3"><Textarea rows={3} value={f.terms} onChange={e => setF({ ...f, terms: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              <FileDown className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : (initial ? 'Update & Re-Generate PDF' : 'Save & Generate PDF')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsersView({ user }) {
  const { call } = useApi();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [permUser, setPermUser] = useState(null);
  const [orgAccessUser, setOrgAccessUser] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc'
          ? (valA > valB ? 1 : -1)
          : (valB > valA ? 1 : -1);
      }
    });
  }, [users, sortField, sortOrder]);

  async function load() {
    try { const d = await call('users'); setUsers(d.users || []); }
    catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function del(id) {
    if (!confirm('Delete user?')) return;
    try { await call(`users/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff Management"
        subtitle="Manage admin, managers and staff accounts"
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New Staff</Button>}
      />
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader label="Name" field="name" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Email" field="email" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Role" field="role" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Created" field="createdAt" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{u.role}</Badge></TableCell>
                  <TableCell className="text-sm text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {u.role !== 'admin' && (
                        <Button size="sm" variant="ghost" onClick={() => setPermUser(u)} title="Module access"><ShieldCheck className="w-4 h-4 text-indigo-600" /></Button>
                      )}
                      {u.id !== user.id && (
                        <Button size="sm" variant="ghost" onClick={() => setOrgAccessUser(u)} title="Organization access"><Building2 className="w-4 h-4 text-emerald-600" /></Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setResetUser(u)} title="Reset password"><KeyRound className="w-4 h-4 text-amber-600" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(u); setOpen(true); }}><Edit className="w-4 h-4" /></Button>
                      {u.id !== user.id && (<Button size="sm" variant="ghost" onClick={() => del(u.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {open && <UserForm user={user} initial={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
      {resetUser && <AdminResetPasswordDialog target={resetUser} onClose={() => setResetUser(null)} />}
      {permUser && <PermissionsDialog target={permUser} onClose={() => { setPermUser(null); load(); }} />}
      {orgAccessUser && <OrgAccessDialog target={orgAccessUser} onClose={() => { setOrgAccessUser(null); load(); }} />}
    </div>
  );
}

function AdminResetPasswordDialog({ target, onClose }) {
  const { call } = useApi();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  function genRandom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setPwd(s); setConfirm(s);
  }
  async function submit(e) {
    e.preventDefault();
    if (pwd.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (pwd !== confirm) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try {
      await call(`users/${target.id}`, { method: 'PUT', body: { password: pwd } });
      toast.success(`Password reset for ${target.name}. Share new credentials securely.`);
      onClose();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password — {target.name}</DialogTitle>
          <DialogDescription>
            Set a new password for <strong>{target.email}</strong>. The user will need to use this new password to sign in. 
            Share it with them via a secure channel.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={genRandom}>
              <Sparkles className="w-4 h-4 mr-1" /> Generate Random
            </Button>
          </div>
          <Field label="New Password *">
            <Input type="text" value={pwd} onChange={e => setPwd(e.target.value)} required minLength={6} placeholder="Enter or generate password" />
          </Field>
          <Field label="Confirm Password *">
            <Input type="text" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} />
          </Field>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ Password is shown as plain text so you can copy and share. After this reset the user&apos;s previous password will no longer work.
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Resetting...' : 'Reset Password'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserForm({ user, initial, onClose, onSaved }) {
  const { call } = useApi();
  const [f, setF] = useState(() => {
    if (initial) {
      return {
        name: initial.name || '',
        email: initial.email || '',
        role: initial.role || 'staff',
        password: '',
        whatsappNumber: initial.whatsappNumber || '',
        whatsappOptIn: !!initial.whatsappOptIn,
        whatsappNotificationsEnabled: !!initial.whatsappNotificationsEnabled,
        dailyRosterEnabled: !!initial.dailyRosterEnabled,
        telegramChatId: initial.telegramChatId || '',
        telegramOptIn: !!initial.telegramOptIn,
        telegramNotificationsEnabled: !!initial.telegramNotificationsEnabled,
        telegramDailyRosterEnabled: !!initial.telegramDailyRosterEnabled,
      };
    }
    return {
      name: '',
      email: '',
      role: 'staff',
      password: '',
      whatsappNumber: '',
      whatsappOptIn: false,
      whatsappNotificationsEnabled: false,
      dailyRosterEnabled: false,
      telegramChatId: '',
      telegramOptIn: false,
      telegramNotificationsEnabled: false,
      telegramDailyRosterEnabled: false,
    };
  });
  const [saving, setSaving] = useState(false);
  const [orgsList, setOrgsList] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [selectedOrgIds, setSelectedOrgIds] = useState(() => {
    if (initial && initial.orgs) {
      return initial.orgs.map(o => o.orgId);
    }
    return user ? [user.activeOrgId] : [];
  });
  const [sendingRoster, setSendingRoster] = useState(false);

  async function sendManualRoster() {
    if (!initial?.id) {
      toast.error('Save the user first before manually generating the roster.');
      return;
    }
    if (!f.telegramChatId && !f.whatsappNumber) {
      toast.error('This user has no active channels (Telegram or WhatsApp) configured.');
      return;
    }
    setSendingRoster(true);
    try {
      const res = await call('auth/send-manual-roster', {
        method: 'POST',
        body: { targetUserId: initial.id }
      });
      if (res.ok) {
        toast.success(res.message || 'Daily roster generated and sent successfully!');
      } else {
        toast.error(res.error || 'Failed to send daily roster');
      }
    } catch (e) {
      toast.error(e.message || 'Error occurred while sending daily roster');
    } finally {
      setSendingRoster(false);
    }
  }

  useEffect(() => {
    async function fetchOrgs() {
      try {
        const data = await call('organisations?all=true');
        if (data.organisations) {
          setOrgsList(data.organisations);
        }
      } catch (e) {
        console.error('Failed to load organisations in UserForm:', e);
      } finally {
        setLoadingOrgs(false);
      }
    }
    fetchOrgs();
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (selectedOrgIds.length === 0) {
      toast.error('Please select at least one organization');
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        const body = {
          name: f.name,
          email: f.email,
          role: f.role,
          whatsappNumber: f.whatsappNumber || '',
          whatsappOptIn: !!f.whatsappOptIn,
          whatsappNotificationsEnabled: !!f.whatsappNotificationsEnabled,
          dailyRosterEnabled: !!f.dailyRosterEnabled,
          telegramChatId: f.telegramChatId || '',
          telegramOptIn: !!f.telegramOptIn,
          telegramNotificationsEnabled: !!f.telegramNotificationsEnabled,
          telegramDailyRosterEnabled: !!f.telegramDailyRosterEnabled,
          allowedOrgIds: selectedOrgIds
        };
        if (f.password) body.password = f.password;
        await call(`users/${initial.id}`, { method: 'PUT', body });
        toast.success('User updated');
      } else {
        if (!f.password) { toast.error('Password required'); setSaving(false); return; }
        const body = {
          ...f,
          whatsappNumber: f.whatsappNumber || '',
          whatsappOptIn: !!f.whatsappOptIn,
          whatsappNotificationsEnabled: !!f.whatsappNotificationsEnabled,
          dailyRosterEnabled: !!f.dailyRosterEnabled,
          telegramChatId: f.telegramChatId || '',
          telegramOptIn: !!f.telegramOptIn,
          telegramNotificationsEnabled: !!f.telegramNotificationsEnabled,
          telegramDailyRosterEnabled: !!f.telegramDailyRosterEnabled,
          allowedOrgIds: selectedOrgIds
        };
        await call('users', { method: 'POST', body });
        toast.success('User created');
      }
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>{initial ? 'Edit Staff' : 'New Staff Member'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full Name *"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Email *"><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Role">
            <Select value={f.role} onValueChange={v => setF({ ...f, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={initial ? 'New Password (leave blank to keep)' : 'Password *'}>
            <Input type="password" value={f.password || ''} onChange={e => setF({ ...f, password: e.target.value })} />
          </Field>
          
          <Field label="WhatsApp Number (e.g. 919876543210)">
            <Input type="text" placeholder="e.g. 919876543210" value={f.whatsappNumber || ''} onChange={e => setF({ ...f, whatsappNumber: e.target.value })} />
          </Field>

          <Field label="Telegram Chat ID (e.g. 123456789)">
            <Input type="text" placeholder="e.g. 123456789" value={f.telegramChatId || ''} onChange={e => setF({ ...f, telegramChatId: e.target.value })} />
            <span className="text-[10px] text-slate-400 block mt-1">Get your Chat ID by messaging @userinfobot or adding your bot to a group.</span>
          </Field>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Organization Access *</div>
            {loadingOrgs ? (
              <div className="text-xs text-slate-400">Loading organizations...</div>
            ) : orgsList.length === 0 ? (
              <div className="text-xs text-red-500">No organizations found.</div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-md p-2.5 bg-slate-50">
                {orgsList.map(org => {
                  const checked = selectedOrgIds.includes(org.id);
                  return (
                    <label key={org.id} className="flex items-center space-x-2 text-xs cursor-pointer py-1 px-1.5 rounded hover:bg-slate-200 select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            if (selectedOrgIds.length > 1) {
                              setSelectedOrgIds(selectedOrgIds.filter(id => id !== org.id));
                            } else {
                              toast.error('At least one organization must be selected');
                            }
                          } else {
                            setSelectedOrgIds([...selectedOrgIds, org.id]);
                          }
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span className="text-slate-700 font-medium truncate" title={org.name}>
                        {org.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">WhatsApp Configuration</div>
            
            <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={!!f.whatsappOptIn} onChange={e => setF({ ...f, whatsappOptIn: e.target.checked })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
              <span className="text-slate-700 font-medium">Recipient Opt-In Confirmed</span>
            </label>
            
            <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={!!f.whatsappNotificationsEnabled} onChange={e => setF({ ...f, whatsappNotificationsEnabled: e.target.checked })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
              <span className="text-slate-700 font-medium">Receive Task Assignment / Reassignment Alerts</span>
            </label>
            
            <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={!!f.dailyRosterEnabled} onChange={e => setF({ ...f, dailyRosterEnabled: e.target.checked })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
              <span className="text-slate-700 font-medium">Receive Daily 9:30 AM PDF Roster</span>
            </label>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-2">Telegram Configuration</div>
            
            <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={!!f.telegramOptIn} onChange={e => setF({ ...f, telegramOptIn: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
              <span className="text-slate-700 font-medium">Telegram Opt-In Confirmed</span>
            </label>
            
            <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={!!f.telegramNotificationsEnabled} onChange={e => setF({ ...f, telegramNotificationsEnabled: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
              <span className="text-slate-700 font-medium">Receive Task & Lead Alerts on Telegram</span>
            </label>
            
            <label className="flex items-center space-x-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={!!f.telegramDailyRosterEnabled} onChange={e => setF({ ...f, telegramDailyRosterEnabled: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
              <span className="text-slate-700 font-medium">Receive Daily PDF Roster on Telegram</span>
            </label>
          </div>

          {initial && (
            <div className="space-y-3 p-3 bg-slate-50 border border-slate-200/60 rounded-lg">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileDown className="w-3.5 h-3.5 text-blue-600" /> On-Demand Roster Generator
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Generate this staff member&apos;s daily performance & task roster PDF right now and send it to their active channels.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={sendManualRoster}
                disabled={sendingRoster}
                className="w-full text-xs font-semibold bg-white border-blue-200 text-blue-700 hover:bg-blue-50/50 flex items-center justify-center gap-1.5"
              >
                {sendingRoster ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating & Dispatching...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Generate & Send Roster Now
                  </>
                )}
              </Button>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =================== CALENDAR ===================
function CalendarView({ user, setView }) {
  const { call } = useApi();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [data, setData] = useState({ tasks: [], leads: [], appointments: [] });

  async function load() {
    const from = pad(month.getFullYear(), month.getMonth() + 1, 1);
    const to = pad(month.getFullYear(), month.getMonth() + 1, new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());
    try { setData(await call(`calendar?from=${from}&to=${to}`)); } catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, [month]);

  function pad(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const today = new Date();
  const todayStr = pad(today.getFullYear(), today.getMonth() + 1, today.getDate());

  function dateStr(d) { return pad(month.getFullYear(), month.getMonth() + 1, d); }
  function eventsFor(d) {
    const ds = dateStr(d);
    const t = data.tasks.filter(t => (t.dueDate || '').slice(0, 10) === ds);
    const l = data.leads.filter(l => (l.followUpDate || '').slice(0, 10) === ds);
    const a = (data.appointments || []).filter(a => (a.date || '').slice(0, 10) === ds);
    return { tasks: t, leads: l, appointments: a };
  }

  function statusStyle(t) {
    // Color-code task by status. Overdue (past + not done) overrides.
    const due = (t.dueDate || '').slice(0, 10);
    const isOverdue = due && due < todayStr && t.status !== 'Completed';
    if (t.status === 'Completed') return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200 line-through opacity-80';
    if (isOverdue) return 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-300 font-semibold';
    if (t.status === 'In Progress') return 'bg-violet-100 text-violet-800 hover:bg-violet-200 border border-violet-200';
    if (t.status === 'Pending') return 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200';
    return 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200';
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar"
        subtitle="Tasks & follow-ups on a monthly view"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="w-4 h-4" /></Button>
            <div className="font-semibold text-lg w-40 text-center">
              {month.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
            </div>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
          </div>
        }
      />
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="min-h-[100px] bg-slate-50 rounded" />;
              const ev = eventsFor(d);
              const isToday = dateStr(d) === todayStr;
              return (
                <div key={i} className={`min-h-[100px] border rounded p-1.5 ${isToday ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200'}`}>
                  <div className={`text-xs font-bold mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>{d}</div>
                  <div className="space-y-0.5">
                    {ev.tasks.slice(0, 3).map(t => (
                      <button
                        key={t.id}
                        onClick={() => setView('tasks', { openId: t.id })}
                        className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate transition ${statusStyle(t)}`}
                        title={`${t.title} — ${t.status}`}
                      >
                        {t.status === 'Completed' ? '✓' : t.status === 'In Progress' ? '◐' : (t.dueDate && t.dueDate.slice(0,10) < todayStr ? '⚠' : '◯')} {t.title}
                      </button>
                    ))}
                    {ev.appointments.slice(0, 2).map(a => (
                      <button key={a.id} onClick={() => setView('appointments', { openId: a.id })} className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate border ${a.type === 'client_visit' ? 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200' : 'bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200'}`} title={`Appointment: ${a.title}`}>
                        {a.type === 'client_visit' ? '🚗' : '🏢'} {a.title}
                      </button>
                    ))}
                    {ev.leads.slice(0, 2).map(l => (
                      <button key={l.id} onClick={() => setView('leads', { openId: l.id })} className="w-full text-left text-[10px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 truncate hover:bg-indigo-200 border border-indigo-200" title={l.name}>
                        📞 {l.name}
                      </button>
                    ))}
                    {(ev.tasks.length + ev.leads.length + ev.appointments.length > 5) && (
                      <div className="text-[10px] text-slate-500">+{ev.tasks.length + ev.leads.length + ev.appointments.length - 5} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-semibold text-slate-600 mb-2">Legend</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-700">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-4 rounded bg-amber-100 border border-amber-200" />
              <span>◯ Pending</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-4 rounded bg-violet-100 border border-violet-200" />
              <span>◐ In Progress</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-4 rounded bg-emerald-100 border border-emerald-200" />
              <span>✓ Completed</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-4 rounded bg-red-100 border border-red-300" />
              <span>⚠ Overdue</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-4 rounded bg-indigo-100 border border-indigo-200" />
              <span>📞 Lead follow-up</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-4 rounded border border-indigo-500 bg-indigo-50/30" />
              <span>Today</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =================== CLIENTS ===================
function ClientsView({ user, setView, viewParams = {} }) {
  const { call } = useApi();
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ledgerId, setLedgerId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  async function load(currentPage = page) {
    try {
      const d = await call(`clients?page=${currentPage}&limit=25`);
      setClients(d.clients || []);
      setTotalItems(d.total || 0);
      if (viewParams.openId) setLedgerId(viewParams.openId);
    } catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(page); }, [page, viewParams.openId]);

  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const filtered = useMemo(() => {
    const res = clients.filter(c => !q || `${c.name} ${c.company} ${c.phone} ${c.email} ${c.gstin}`.toLowerCase().includes(q.toLowerCase()));
    return res.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc'
          ? (valA > valB ? 1 : -1)
          : (valB > valA ? 1 : -1);
      }
    });
  }, [clients, q, sortField, sortOrder]);

  async function del(id) {
    if (!confirm('Delete this client? Invoices/payments will remain.')) return;
    try { await call(`clients/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }

  function doExport() {
    const rows = filtered.map(c => ({
      Name: c.name, Company: c.company, Phone: c.phone, Email: c.email, GSTIN: c.gstin,
      OpeningBalance: c.openingBalance, AsOn: c.openingBalanceAsOn,
      Billed: c.billed, Received: c.received, NetDue: c.netDue,
    }));
    exportToExcel(rows, `clients_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${rows.length} clients`);
  }

  const totalDue = filtered.reduce((s, c) => s + (c.netDue || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        subtitle={`${filtered.length} of ${totalItems} clients • Total net due: ₹${totalDue.toLocaleString('en-IN')}`}
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={doExport}><FileSpreadsheet className="w-4 h-4 mr-2" />Export</Button>
            {user.role !== 'staff' && (
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-2" />Import Excel</Button>
            )}
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New Client</Button>
          </div>
        }
      />
      <Card>
        <CardContent className="pt-4">
          <div className="relative mb-4 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input placeholder="Search by name, company, phone, GSTIN..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader label="Name" field="name" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Contact" field="email" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="GSTIN" field="gstin" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Opening" field="openingBalance" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="Billed" field="billed" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="Received" field="received" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="Net Due" field="netDue" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id} className="hover:bg-slate-50">
                  <TableCell>
                    <button onClick={() => setLedgerId(c.id)} className="font-medium text-indigo-600 hover:underline text-left">{c.name}</button>
                    {c.company && <div className="text-xs text-slate-500">{c.company}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.phone}{c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{c.gstin || '-'}</TableCell>
                  <TableCell className="text-right text-sm">
                    ₹{(c.openingBalance || 0).toLocaleString('en-IN')}
                    {c.openingBalanceAsOn && <div className="text-[10px] text-slate-500">as on {c.openingBalanceAsOn}</div>}
                  </TableCell>
                  <TableCell className="text-right text-sm">₹{(c.billed || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right text-sm text-emerald-600">₹{(c.received || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell className={`text-right font-semibold ${c.netDue > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    ₹{(c.netDue || 0).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setLedgerId(c.id)} title="View ledger"><Receipt className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Edit className="w-4 h-4" /></Button>
                    {user.role === 'admin' && <Button size="sm" variant="ghost" onClick={() => del(c.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No clients yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
          <Pagination
            currentPage={page}
            totalItems={totalItems}
            limit={25}
            onPageChange={(p) => setPage(p)}
            className="-mx-6 -mb-6 mt-4 border-t"
          />
        </CardContent>
      </Card>
      {open && <ClientForm initial={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
      {ledgerId && <ClientLedger clientId={ledgerId} onClose={() => { setLedgerId(null); setView('clients', {}); load(); }} user={user} />}
      {importOpen && <ClientImportDialog onClose={() => setImportOpen(false)} onImported={() => { setImportOpen(false); load(); }} />}
    </div>
  );
}

function ClientForm({ initial, onClose, onSaved }) {
  const { call } = useApi();
  const [f, setF] = useState(initial || {
    name: '', company: '', phone: '', email: '', address: '',
    gstin: '', pan: '', openingBalance: 0,
    openingBalanceAsOn: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try {
      if (initial) { await call(`clients/${initial.id}`, { method: 'PUT', body: f }); toast.success('Client updated'); }
      else { await call('clients', { method: 'POST', body: f }); toast.success('Client added'); }
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Client' : 'New Client'}</DialogTitle>
          <DialogDescription>Setting an <strong>opening balance as on a specific date</strong> is essential for accurate net-due calculations.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Name *"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Company"><Input value={f.company} onChange={e => setF({ ...f, company: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="GSTIN"><Input value={f.gstin} onChange={e => setF({ ...f, gstin: e.target.value })} /></Field>
          <Field label="PAN"><Input value={f.pan} onChange={e => setF({ ...f, pan: e.target.value })} /></Field>
          <Field label="Address" className="col-span-2"><Textarea rows={2} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
          <div className="col-span-2 p-3 rounded-md bg-amber-50 border border-amber-200">
            <div className="text-sm font-semibold text-amber-900 mb-2">📌 Opening Balance (Carry-forward)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening Balance Amount (₹)">
                <Input type="number" step="0.01" value={f.openingBalance} onChange={e => setF({ ...f, openingBalance: e.target.value })} />
              </Field>
              <Field label="As On Date *">
                <Input type="date" value={f.openingBalanceAsOn} onChange={e => setF({ ...f, openingBalanceAsOn: e.target.value })} required />
              </Field>
            </div>
            <div className="text-xs text-amber-800 mt-2">This balance + future invoices − payments = net due owed by client.</div>
          </div>
          <Field label="Notes" className="col-span-2"><Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Client'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClientLedger({ clientId, onClose, user }) {
  const { call } = useApi();
  const [data, setData] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [editInvoice, setEditInvoice] = useState(null);
  const [branding, setBranding] = useState({});

  async function load() {
    try { setData(await call(`clients/${clientId}/ledger`)); } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(); }, [clientId]);
  useEffect(() => {
    call('branding').then(b => setBranding(b.branding || {})).catch(() => {});
  }, []);

  async function deleteAdj(id) {
    if (!confirm('Are you sure you want to delete this direct ledger entry?')) return;
    try {
      await call(`ledger-adjustments/${id}`, { method: 'DELETE' });
      toast.success('Ledger entry deleted');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  if (!data) return null;
  const c = data.client;
  const totalDebits = data.totalDebits ?? data.billed;
  const totalCredits = data.totalCredits ?? data.received;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{c.name} — Ledger</DialogTitle>
          <DialogDescription>{c.company || 'Individual'} • {c.phone} {c.gstin ? `• GSTIN: ${c.gstin}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Opening" value={c.openingBalance} subtitle={`as on ${c.openingBalanceAsOn || 'start'}`} />
          <SummaryCard label="Total Debits" value={totalDebits} subtitle={`${data.invoices.length} inv${data.debitAdjustments ? ` + ₹${data.debitAdjustments} debits` : ''}`} />
          <SummaryCard label="Total Credits" value={totalCredits} subtitle={`${data.payments.length} pay${data.creditAdjustments ? ` + ₹${data.creditAdjustments} credits` : ''}`} color="text-emerald-600" />
          <SummaryCard label="Net Due" value={data.netDue} highlight color={data.netDue > 0 ? 'text-red-600' : 'text-emerald-600'} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setInvoiceOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <FilePlus className="w-4 h-4 mr-2" />Generate Invoice
          </Button>
          <Button variant="outline" className="border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100" onClick={() => setAdjOpen(true)}>
            <PlusCircle className="w-4 h-4 mr-2 text-amber-700" />Direct Debit / Credit
          </Button>
          <Button variant="outline" onClick={() => setPayOpen(true)}>
            <Wallet className="w-4 h-4 mr-2 text-emerald-600" />Record Payment
          </Button>
          <Button variant="outline" onClick={() => exportToExcel(data.ledger, `ledger_${c.name.replace(/\s+/g,'_')}.xlsx`)}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />Export Ledger
          </Button>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Transaction History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ledger.map((e, i) => {
                  const invObj = e.type === 'invoice' ? (data.invoices || []).find(x => x.id === e.id) : null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-sm whitespace-nowrap">{e.date}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          {e.type === 'invoice' ? (
                            <button
                              type="button"
                              onClick={() => setViewInvoice(invObj || { id: e.id, invoiceNumber: e.label.replace('Invoice ', '') })}
                              className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 group text-left"
                              title="Click to view & edit invoice"
                            >
                              <span>{e.label}</span>
                            </button>
                          ) : (
                            <span className={`text-sm ${e.type === 'opening' ? 'font-semibold' : ''}`}>{e.label}</span>
                          )}
                          {e.type === 'debit_adjustment' && <Badge variant="outline" className="text-indigo-700 bg-indigo-50 border-indigo-200 text-[10px]">Direct Debit</Badge>}
                          {e.type === 'credit_adjustment' && <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">Direct Credit</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{e.debit > 0 ? `₹${e.debit.toLocaleString('en-IN')}` : '-'}</TableCell>
                      <TableCell className="text-right text-sm text-emerald-600">{e.credit > 0 ? `₹${e.credit.toLocaleString('en-IN')}` : '-'}</TableCell>
                      <TableCell className={`text-right font-medium ${e.balance > 0 ? 'text-red-600' : 'text-slate-700'}`}>₹{e.balance.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right p-1">
                        {e.type === 'invoice' && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1 text-indigo-700 hover:bg-indigo-50 border border-indigo-100"
                              onClick={() => setViewInvoice(invObj || { id: e.id, invoiceNumber: e.label.replace('Invoice ', '') })}
                              title="View invoice details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">View</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1 text-slate-700 hover:bg-slate-100 border border-slate-200"
                              onClick={() => setEditInvoice(invObj || { id: e.id, clientId, clientName: c.name })}
                              title="Edit invoice"
                            >
                              <Edit className="w-3.5 h-3.5 text-slate-600" />
                              <span className="hidden sm:inline">Edit</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600"
                              onClick={() => generateInvoicePDF(invObj || { id: e.id, invoiceNumber: e.label.replace('Invoice ', ''), clientName: c.name, total: e.debit }, branding)}
                              title="Download Invoice PDF"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                        {e.id && (e.type === 'debit_adjustment' || e.type === 'credit_adjustment') && (user?.role === 'admin' || user?.role === 'owner' || !user?.role) && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600" onClick={() => deleteAdj(e.id)} title="Delete adjustment">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {viewInvoice && (
          <InvoiceViewModal
            invoice={typeof viewInvoice === 'object' && viewInvoice.items ? viewInvoice : null}
            invoiceId={typeof viewInvoice === 'object' ? viewInvoice.id : viewInvoice}
            branding={branding}
            onClose={() => setViewInvoice(null)}
            onEdit={(invToEdit) => {
              setViewInvoice(null);
              setEditInvoice(invToEdit);
            }}
            onRecordPayment={() => {
              setViewInvoice(null);
              setPayOpen(true);
            }}
          />
        )}
        {editInvoice && (
          <InvoiceForm
            invoiceToEdit={editInvoice}
            clients={[c]}
            branding={branding}
            onClose={() => setEditInvoice(null)}
            onSaved={(inv) => {
              setEditInvoice(null);
              load();
              generateInvoicePDF(inv, branding);
            }}
          />
        )}

        {invoiceOpen && (
          <InvoiceForm
            initialClientId={clientId}
            clients={[c]}
            branding={branding}
            onClose={() => setInvoiceOpen(false)}
            onSaved={(inv) => { setInvoiceOpen(false); load(); generateInvoicePDF(inv, branding); }}
          />
        )}
        {adjOpen && (
          <LedgerAdjustmentForm
            clientId={clientId}
            client={c}
            onClose={() => setAdjOpen(false)}
            onSaved={() => { setAdjOpen(false); load(); }}
          />
        )}
        {payOpen && (
          <PaymentForm
            clientId={clientId}
            client={c}
            invoices={data.invoices}
            onClose={() => setPayOpen(false)}
            onSaved={() => { setPayOpen(false); load(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LedgerAdjustmentForm({ clientId, client, onClose, onSaved }) {
  const { call } = useApi();
  const [f, setF] = useState({
    clientId: clientId || client?.id || '',
    type: 'debit',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    description: 'Simplicity Sale',
    reference: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!f.amount || Number(f.amount) <= 0) {
      toast.error('Please enter a valid positive amount');
      return;
    }
    setSaving(true);
    try {
      await call('ledger-adjustments', {
        method: 'POST',
        body: { ...f, amount: Number(f.amount) }
      });
      const typeLabel = f.type === 'debit' ? 'Direct Debit (+ Receivable)' : 'Direct Credit (- Receivable)';
      toast.success(`${typeLabel} entry of ₹${Number(f.amount).toLocaleString('en-IN')} saved`);
      onSaved();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[95vw] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Direct Ledger Entry (Debit / Credit)</DialogTitle>
          <DialogDescription>
            Adjust receivables for <strong>{client?.name || client?.clientName || 'Client'}</strong> directly without needing a full itemized invoice.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Entry Type *">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              <button
                type="button"
                onClick={() => setF({ ...f, type: 'debit', description: f.description === 'Ledger Credit Discount' ? 'Simplicity Sale' : f.description || 'Simplicity Sale' })}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  f.type === 'debit'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 font-medium shadow-sm ring-1 ring-indigo-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-indigo-700 text-sm">
                  <PlusCircle className="w-4 h-4" />
                  <span>Debit (+ Receivable)</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-snug">
                  Increases receivable balance owed by client (e.g. Simplicity Sale, Fee, Debit Note)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setF({ ...f, type: 'credit', description: f.description === 'Simplicity Sale' ? 'Ledger Credit Discount' : f.description || 'Ledger Credit Discount' })}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  f.type === 'credit'
                    ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 font-medium shadow-sm ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-emerald-700 text-sm">
                  <MinusCircle className="w-4 h-4" />
                  <span>Credit (- Receivable)</span>
                </div>
                <div className="text-[11px] text-slate-500 leading-snug">
                  Decreases receivable balance owed by client (e.g. Discount, Waiver, Credit Note)
                </div>
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Amount (₹) *">
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={f.amount}
                onChange={e => setF({ ...f, amount: e.target.value })}
                required
              />
            </Field>

            <Field label="Entry Date *">
              <Input
                type="date"
                value={f.date}
                onChange={e => setF({ ...f, date: e.target.value })}
                required
              />
            </Field>
          </div>

          <Field label="Particulars / Description *">
            <Input
              value={f.description}
              onChange={e => setF({ ...f, description: e.target.value })}
              placeholder={f.type === 'debit' ? 'e.g. Simplicity Sale - Services' : 'e.g. Volume Discount / Waiver'}
              required
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Reference / Voucher # (Optional)">
              <Input
                value={f.reference}
                onChange={e => setF({ ...f, reference: e.target.value })}
                placeholder="e.g. DB-101 or CR-202"
              />
            </Field>
            <Field label="Notes (Optional)">
              <Input
                value={f.notes}
                onChange={e => setF({ ...f, notes: e.target.value })}
                placeholder="Internal memo"
              />
            </Field>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={saving}
              className={f.type === 'debit' ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
            >
              {saving ? 'Saving...' : `Save ${f.type === 'debit' ? 'Debit (+)' : 'Credit (-)'} Entry`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, subtitle, color = 'text-slate-900', highlight }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'border-indigo-500 bg-indigo-50/40' : 'bg-white'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>₹{(value || 0).toLocaleString('en-IN')}</div>
      {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
    </div>
  );
}

function PaymentForm({ clientId, client, invoices, onClose, onSaved }) {
  const { call } = useApi();
  const unpaid = (invoices || []).filter(i => i.status !== 'Paid');
  const [f, setF] = useState({
    clientId,
    invoiceId: '',
    amount: 0,
    mode: 'Bank',
    reference: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try {
      await call('payments', { method: 'POST', body: f });
      toast.success(`Payment of ₹${f.amount} recorded via ${f.mode}`);
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment from {client.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Against Invoice (optional)">
            <Select value={f.invoiceId || 'none'} onValueChange={v => setF({ ...f, invoiceId: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="On account (no specific invoice)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">On account / opening balance</SelectItem>
                {unpaid.map(i => <SelectItem key={i.id} value={i.id}>{i.invoiceNumber} — ₹{i.total.toLocaleString('en-IN')}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *"><Input type="number" step="0.01" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} required /></Field>
            <Field label="Mode *">
              <Select value={f.mode} onValueChange={v => setF({ ...f, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Cash', 'Bank', 'UPI', 'Cheque', 'Card', 'NEFT/RTGS'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date *"><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required /></Field>
            <Field label="Reference (UTR / Cheque #)"><Input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Record Payment'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =================== INVOICES ===================
async function generateInvoicePDF(inv, branding = {}) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  const firmName = branding.firmName || 'ABC & Associates';
  const firmAddr = branding.firmAddress || '';
  const firmContact = branding.firmContact || '';
  const firmGstin = branding.firmGstin || '';

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 90, 'F');
  // Logo
  if (branding.logoBase64) {
    try { doc.addImage(branding.logoBase64, 'PNG', 40, 18, 56, 56); } catch {}
  }
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(firmName, branding.logoBase64 ? 108 : 40, 40);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(firmAddr, branding.logoBase64 ? 108 : 40, 56);
  doc.text(firmContact, branding.logoBase64 ? 108 : 40, 70);
  if (firmGstin) doc.text(`GSTIN: ${firmGstin}`, branding.logoBase64 ? 108 : 40, 82);

  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('TAX INVOICE', pageW - 40, 130, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`No: ${inv.invoiceNumber}`, pageW - 40, 148, { align: 'right' });
  doc.text(`Date: ${new Date(inv.createdAt).toLocaleDateString('en-IN')}`, pageW - 40, 162, { align: 'right' });
  if (inv.dueDate) doc.text(`Due: ${new Date(inv.dueDate).toLocaleDateString('en-IN')}`, pageW - 40, 176, { align: 'right' });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('BILL TO', 40, 130);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  let y = 148;
  doc.text(inv.clientName, 40, y); y += 14;
  if (inv.companyName) { doc.text(inv.companyName, 40, y); y += 14; }
  if (inv.clientAddress) {
    const lines = doc.splitTextToSize(inv.clientAddress, 240);
    doc.text(lines, 40, y); y += lines.length * 14;
  }
  if (inv.clientGstin) { doc.text(`GSTIN: ${inv.clientGstin}`, 40, y); y += 14; }

  const rows = (inv.items || []).map((s, i) => [
    i + 1, s.name, s.description || '-', String(s.qty || 1),
    `INR ${Number(s.rate).toLocaleString('en-IN')}`,
    `INR ${(Number(s.rate) * Number(s.qty || 1)).toLocaleString('en-IN')}`,
  ]);
  autoTable(doc, {
    startY: Math.max(y + 10, 220),
    head: [['#', 'Item', 'Description', 'Qty', 'Rate', 'Amount']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: { 0: { cellWidth: 28 }, 3: { halign: 'center', cellWidth: 40 }, 4: { halign: 'right', cellWidth: 80 }, 5: { halign: 'right', cellWidth: 90 } },
  });

  let endY = doc.lastAutoTable.finalY + 10;
  const boxX = pageW - 240;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', boxX, endY + 14);
  doc.text(`INR ${inv.subtotal.toLocaleString('en-IN')}`, pageW - 40, endY + 14, { align: 'right' });
  if (inv.gstApplicable) {
    doc.text('GST (18%):', boxX, endY + 30);
    doc.text(`INR ${inv.gstAmount.toLocaleString('en-IN')}`, pageW - 40, endY + 30, { align: 'right' });
    endY += 16;
  }
  doc.setLineWidth(1); doc.line(boxX, endY + 36, pageW - 40, endY + 36);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('TOTAL:', boxX, endY + 52);
  doc.text(`INR ${inv.total.toLocaleString('en-IN')}`, pageW - 40, endY + 52, { align: 'right' });

  if (inv.paidAmount !== undefined && inv.paidAmount > 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Paid:', boxX, endY + 70);
    doc.text(`INR ${inv.paidAmount.toLocaleString('en-IN')}`, pageW - 40, endY + 70, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 0, 0);
    doc.text('Balance Due:', boxX, endY + 86);
    doc.text(`INR ${inv.dueAmount.toLocaleString('en-IN')}`, pageW - 40, endY + 86, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    endY += 32;
  }

  // Bank details
  if (branding.bankName || branding.upiId) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Payment Details', 40, endY + 80);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    let by = endY + 96;
    if (branding.bankName) { doc.text(`Bank: ${branding.bankName}`, 40, by); by += 12; }
    if (branding.bankAccount) { doc.text(`A/c: ${branding.bankAccount}`, 40, by); by += 12; }
    if (branding.bankIfsc) { doc.text(`IFSC: ${branding.bankIfsc}`, 40, by); by += 12; }
    if (branding.upiId) { doc.text(`UPI: ${branding.upiId}`, 40, by); by += 12; }
  }

  if (inv.notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(`Notes: ${inv.notes}`, pageW - 80);
    doc.text(wrapped, 40, endY + 160);
  }
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(200); doc.line(40, ph - 60, pageW - 40, ph - 60);
  doc.setFontSize(8); doc.setTextColor(100);
  doc.text(branding.footerText || 'This is a computer-generated invoice.', pageW / 2, ph - 42, { align: 'center' });

  doc.save(`${inv.invoiceNumber}_${inv.clientName.replace(/\s+/g, '_')}.pdf`);
}

function InvoicesView({ user, viewParams = {}, setView }) {
  const { call } = useApi();
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState(viewParams.status || 'all');
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(null);
  const [viewInvoiceModal, setViewInvoiceModal] = useState(null);
  const [editInvoiceModal, setEditInvoiceModal] = useState(null);
  const [branding, setBranding] = useState({});

  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  async function load(currentPage = page) {
    try {
      let url = `invoices?page=${currentPage}&limit=25`;
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;

      const [i, c, b] = await Promise.all([call(url), call('clients'), call('branding')]);
      setInvoices(i.invoices || []); setClients(c.clients || []); setBranding(b.branding || {});
      setTotalItems(i.total || 0);

      if (viewParams.openId) {
        let f = (i.invoices || []).find(x => x.id === viewParams.openId);
        if (f) {
          setViewInvoiceModal(f);
        } else {
          try {
            const res = await call(`invoices?id=${viewParams.openId}`);
            if (res.invoices && res.invoices[0]) {
              setViewInvoiceModal(res.invoices[0]);
            }
          } catch {}
        }
      }
    } catch (e) { toast.error(e.message); }
  }

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  // Load when page, statusFilter, or openId changes
  useEffect(() => {
    load(page);
  }, [page, statusFilter, viewParams.openId]);
  useEffect(() => { if (viewParams.status) setStatusFilter(viewParams.status); }, [viewParams.status]);

  const [sortField, setSortField] = useState('invoiceNumber');
  const [sortOrder, setSortOrder] = useState('desc');

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const filtered = useMemo(() => {
    const res = invoices.filter(i =>
      (statusFilter === 'all' || i.status === statusFilter) &&
      (!q || `${i.invoiceNumber} ${i.clientName} ${i.companyName}`.toLowerCase().includes(q.toLowerCase()))
    );
    return res.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc'
          ? (valA > valB ? 1 : -1)
          : (valB > valA ? 1 : -1);
      }
    });
  }, [invoices, q, statusFilter, sortField, sortOrder]);

  async function del(id) {
    if (!confirm('Delete invoice?')) return;
    try { await call(`invoices/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }
  function doExport() {
    const rows = filtered.map(i => ({
      Number: i.invoiceNumber, Client: i.clientName, Company: i.companyName,
      Subtotal: i.subtotal, GST: i.gstAmount, Total: i.total, Paid: i.paidAmount, Due: i.dueAmount,
      Status: i.status, DueDate: i.dueDate, CreatedAt: i.createdAt,
    }));
    exportToExcel(rows, `invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${rows.length} invoices`);
  }

  const totalDue = filtered.reduce((s, i) => s + (i.dueAmount || 0), 0);
  const totalBilled = filtered.reduce((s, i) => s + (i.total || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        subtitle={`${filtered.length} of ${totalItems} invoices • Billed: ₹${totalBilled.toLocaleString('en-IN')} • Due: ₹${totalDue.toLocaleString('en-IN')}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={doExport}><FileSpreadsheet className="w-4 h-4 mr-2" />Export</Button>
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />New Invoice</Button>
          </div>
        }
      />
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input placeholder="Search invoice # or client..." className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {['Unpaid','Partial','Paid'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader label="Invoice #" field="invoiceNumber" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Client" field="clientName" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Due Date" field="dueDate" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Total" field="total" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="Paid" field="paidAmount" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="Due" field="dueAmount" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <SortableHeader label="Status" field="status" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(i => (
                <TableRow key={i.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-sm">
                    <button onClick={() => setViewInvoiceModal(i)} className="text-indigo-600 font-semibold hover:underline">{i.invoiceNumber}</button>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setView && setView('clients', { openId: i.clientId })} className="font-medium text-indigo-600 hover:underline text-left">{i.clientName}</button>
                    {i.companyName && <div className="text-xs text-slate-500">{i.companyName}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{i.dueDate || '-'}</TableCell>
                  <TableCell className="text-right text-sm">₹{i.total.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right text-sm text-emerald-600">₹{(i.paidAmount || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right font-semibold text-red-600">₹{(i.dueAmount || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      i.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                      i.status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>{i.status}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setViewInvoiceModal(i)} title="View"><Eye className="w-4 h-4 text-indigo-600" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditInvoiceModal(i)} title="Edit"><Edit className="w-4 h-4 text-slate-600" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => generateInvoicePDF(i, branding)} title="PDF"><FileDown className="w-4 h-4 text-slate-600" /></Button>
                    {i.status !== 'Paid' && (
                      <Button size="sm" variant="ghost" onClick={() => setPayOpen(i)} title="Record payment"><Wallet className="w-4 h-4 text-emerald-600" /></Button>
                    )}
                    {user.role === 'admin' && <Button size="sm" variant="ghost" onClick={() => del(i.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No invoices yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
          <Pagination
            currentPage={page}
            totalItems={totalItems}
            limit={25}
            onPageChange={(p) => setPage(p)}
            className="-mx-6 -mb-6 mt-4 border-t"
          />
        </CardContent>
      </Card>
      {viewInvoiceModal && (
        <InvoiceViewModal
          invoice={viewInvoiceModal}
          branding={branding}
          onClose={() => setViewInvoiceModal(null)}
          onEdit={(inv) => { setViewInvoiceModal(null); setEditInvoiceModal(inv); }}
          onRecordPayment={(inv) => { setViewInvoiceModal(null); setPayOpen(inv); }}
        />
      )}
      {editInvoiceModal && (
        <InvoiceForm
          invoiceToEdit={editInvoiceModal}
          clients={clients}
          branding={branding}
          onClose={() => setEditInvoiceModal(null)}
          onSaved={(inv) => { setEditInvoiceModal(null); load(); generateInvoicePDF(inv, branding); }}
        />
      )}
      {open && <InvoiceForm clients={clients} branding={branding} onClose={() => setOpen(false)} onSaved={(inv) => { setOpen(false); load(); generateInvoicePDF(inv, branding); }} />}
      {payOpen && <PaymentForm clientId={payOpen.clientId} client={{ name: payOpen.clientName }} invoices={[payOpen]} onClose={() => { setPayOpen(null); setView('invoices', {}); }} onSaved={() => { setPayOpen(null); setView('invoices', {}); load(); }} />}
    </div>
  );
}

function InvoiceViewModal({ invoiceId, invoice: initialInvoice, branding, onClose, onEdit, onRecordPayment }) {
  const { call } = useApi();
  const [inv, setInv] = useState(initialInvoice || null);
  const [loading, setLoading] = useState(!initialInvoice || !initialInvoice.items);

  useEffect(() => {
    async function fetchInv() {
      const id = invoiceId || initialInvoice?.id;
      if (!id) return;
      try {
        const res = await call(`invoices/${id}`);
        if (res.invoice) setInv(res.invoice);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchInv();
  }, [invoiceId, initialInvoice]);

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-xl w-[95vw] p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-2" />
          <p className="text-sm text-slate-500 font-medium">Loading invoice details...</p>
        </DialogContent>
      </Dialog>
    );
  }

  if (!inv) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl font-bold font-mono text-slate-900">{inv.invoiceNumber}</DialogTitle>
              <Badge className={`text-xs ${
                inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                inv.status === 'Partial' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300'
              }`}>
                {inv.status || 'Unpaid'}
              </Badge>
            </div>
            <div className="text-xs text-slate-500">
              Date: <span className="font-medium text-slate-700">{inv.createdAt ? inv.createdAt.slice(0, 10) : inv.date || '-'}</span>
              {inv.dueDate ? ` • Due: ${inv.dueDate}` : ''}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Client Details */}
          <div className="p-3.5 rounded-lg border bg-slate-50/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Billed To</div>
              <div className="font-semibold text-slate-900">{inv.clientName}</div>
              {inv.companyName && <div className="text-slate-600 text-xs">{inv.companyName}</div>}
              {inv.clientGstin && <div className="text-slate-500 text-xs mt-0.5">GSTIN: {inv.clientGstin}</div>}
            </div>
            {inv.clientAddress && (
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Address</div>
                <div className="text-slate-600 text-xs whitespace-pre-line">{inv.clientAddress}</div>
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="font-semibold text-xs">Item</TableHead>
                  <TableHead className="font-semibold text-xs">Description</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Qty</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Rate</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(inv.items || []).map((it, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-sm">{it.name || 'Service / Product'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{it.description || '-'}</TableCell>
                    <TableCell className="text-right text-sm">{it.qty || 1}</TableCell>
                    <TableCell className="text-right text-sm">₹{(Number(it.rate) || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-sm font-medium">₹{((Number(it.rate) || 0) * (Number(it.qty) || 1)).toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end border-t pt-3">
            <div className="w-full sm:w-64 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-medium">₹{(inv.subtotal || 0).toLocaleString('en-IN')}</span>
              </div>
              {inv.gstApplicable && (
                <div className="flex justify-between text-slate-600">
                  <span>GST (18%):</span>
                  <span className="font-medium">₹{(inv.gstAmount || 0).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t">
                <span>Total Amount:</span>
                <span>₹{(inv.total || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-emerald-600 text-xs pt-1">
                <span>Paid Amount:</span>
                <span className="font-semibold">₹{(inv.paidAmount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-red-600 font-semibold text-sm pt-1 border-t">
                <span>Balance Due:</span>
                <span>₹{(inv.dueAmount ?? (inv.total - (inv.paidAmount || 0))).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {inv.notes && (
            <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200 text-xs text-amber-900">
              <span className="font-semibold">Notes: </span>{inv.notes}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-between items-center border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => generateInvoicePDF(inv, branding)}>
            <FileDown className="w-4 h-4 mr-2 text-indigo-600" />Download PDF
          </Button>

          <div className="flex gap-2">
            {inv.status !== 'Paid' && onRecordPayment && (
              <Button variant="outline" size="sm" onClick={() => onRecordPayment(inv)} className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
                <Wallet className="w-4 h-4 mr-2 text-emerald-600" />Record Payment
              </Button>
            )}
            {onEdit && (
              <Button size="sm" onClick={() => onEdit(inv)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Edit className="w-4 h-4 mr-2" />Edit Invoice
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceForm({ clients = [], branding, initialClientId, invoiceToEdit, onClose, onSaved }) {
  const { call } = useApi();
  const [clientList, setClientList] = useState(clients || []);
  const [f, setF] = useState({
    id: invoiceToEdit?.id,
    invoiceNumber: invoiceToEdit?.invoiceNumber,
    clientId: invoiceToEdit?.clientId || initialClientId || '',
    clientName: invoiceToEdit?.clientName || '',
    companyName: invoiceToEdit?.companyName || '',
    clientAddress: invoiceToEdit?.clientAddress || '',
    clientGstin: invoiceToEdit?.clientGstin || '',
    items: invoiceToEdit?.items && invoiceToEdit.items.length ? invoiceToEdit.items : [{ name: '', description: '', qty: 1, rate: 0 }],
    gstApplicable: invoiceToEdit?.gstApplicable !== undefined ? invoiceToEdit.gstApplicable : true,
    dueDate: invoiceToEdit?.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    notes: invoiceToEdit?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  function pickClientObj(c) {
    if (!c) return;
    setF(prev => ({
      ...prev,
      clientId: c.id,
      clientName: c.name || c.clientName || '',
      companyName: c.company || c.companyName || '',
      clientAddress: c.address || c.clientAddress || '',
      clientGstin: c.gstin || c.clientGstin || ''
    }));
  }

  useEffect(() => {
    async function init() {
      let list = clients || [];
      if (!list.length) {
        try {
          const res = await call('clients');
          list = res.clients || res.data || [];
          setClientList(list);
        } catch (e) {}
      } else {
        setClientList(list);
      }

      if (invoiceToEdit) {
        setF({
          id: invoiceToEdit.id,
          invoiceNumber: invoiceToEdit.invoiceNumber,
          clientId: invoiceToEdit.clientId || initialClientId || '',
          clientName: invoiceToEdit.clientName || '',
          companyName: invoiceToEdit.companyName || '',
          clientAddress: invoiceToEdit.clientAddress || '',
          clientGstin: invoiceToEdit.clientGstin || '',
          items: invoiceToEdit.items && invoiceToEdit.items.length ? invoiceToEdit.items : [{ name: '', description: '', qty: 1, rate: 0 }],
          gstApplicable: invoiceToEdit.gstApplicable !== undefined ? invoiceToEdit.gstApplicable : true,
          dueDate: invoiceToEdit.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
          notes: invoiceToEdit.notes || '',
        });
      } else if (initialClientId) {
        const c = list.find(x => x.id === initialClientId);
        if (c) {
          pickClientObj(c);
        } else {
          try {
            const res = await call(`clients/${initialClientId}`);
            if (res.client) pickClientObj(res.client);
          } catch (e) {}
        }
      }
    }
    init();
  }, [initialClientId, invoiceToEdit]);

  function pickClient(id) {
    const c = clientList.find(x => x.id === id);
    if (!c) return;
    pickClientObj(c);
  }
  function updateItem(i, k, v) { const arr = [...f.items]; arr[i] = { ...arr[i], [k]: v }; setF({ ...f, items: arr }); }
  function addItem() { setF({ ...f, items: [...f.items, { name: '', description: '', qty: 1, rate: 0 }] }); }
  function removeItem(i) { setF({ ...f, items: f.items.filter((_, x) => x !== i) }); }

  const subtotal = f.items.reduce((s, it) => s + (Number(it.rate) || 0) * (Number(it.qty) || 1), 0);
  const gstAmount = f.gstApplicable ? +(subtotal * 0.18).toFixed(2) : 0;
  const total = +(subtotal + gstAmount).toFixed(2);

  async function submit(e) {
    e.preventDefault();
    if (!f.clientName) { toast.error('Select or enter client'); return; }
    setSaving(true);
    try {
      let savedInv;
      if (f.id) {
        const res = await call(`invoices/${f.id}`, { method: 'PUT', body: f });
        savedInv = res.invoice || { ...f, subtotal, gstAmount, total };
        toast.success(`Invoice ${f.invoiceNumber || ''} updated!`);
      } else {
        const d = await call('invoices', { method: 'POST', body: f });
        savedInv = d.invoice;
        toast.success(`Invoice ${savedInv.invoiceNumber} created!`);
      }
      onSaved(savedInv);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{f.id ? `Edit Invoice (${f.invoiceNumber || 'Draft'})` : 'New Invoice'}</DialogTitle>
          <DialogDescription>
            {f.id ? 'Update client details, line items, or due date. Ledger entries update automatically.' : 'Auto-numbered. PDF generates instantly on save with your branding.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border p-4 bg-slate-50">
            <div className="font-semibold mb-3">Client</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Select Existing Client">
                <Select value={f.clientId || 'new'} onValueChange={v => v !== 'new' && pickClient(v)}>
                  <SelectTrigger><SelectValue placeholder="Pick a client..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">+ New / Manual Entry</SelectItem>
                    {clientList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="GSTIN"><Input value={f.clientGstin} onChange={e => setF({ ...f, clientGstin: e.target.value })} /></Field>
              <Field label="Client Name *"><Input value={f.clientName} onChange={e => setF({ ...f, clientName: e.target.value })} required /></Field>
              <Field label="Company"><Input value={f.companyName} onChange={e => setF({ ...f, companyName: e.target.value })} /></Field>
              <Field label="Address" className="col-span-2"><Textarea rows={2} value={f.clientAddress} onChange={e => setF({ ...f, clientAddress: e.target.value })} /></Field>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Line Items</div>
              <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            <div className="space-y-2">
              {f.items.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-3" placeholder="Item" value={s.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                  <Input className="col-span-4" placeholder="Description" value={s.description} onChange={e => updateItem(i, 'description', e.target.value)} />
                  <Input className="col-span-1" type="number" placeholder="Qty" value={s.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  <Input className="col-span-2" type="number" placeholder="Rate" value={s.rate} onChange={e => updateItem(i, 'rate', e.target.value)} />
                  <div className="col-span-1 text-right text-sm font-medium">₹{((s.rate || 0) * (s.qty || 1)).toLocaleString('en-IN')}</div>
                  <Button type="button" size="sm" variant="ghost" className="col-span-1" onClick={() => removeItem(i)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={f.gstApplicable} onCheckedChange={v => setF({ ...f, gstApplicable: v })} id="gst-inv" />
                <Label htmlFor="gst-inv">Apply GST (18%)</Label>
              </div>
              <div className="text-right">
                <div className="text-sm">Subtotal: <span className="font-semibold">₹{subtotal.toLocaleString('en-IN')}</span></div>
                {f.gstApplicable && <div className="text-sm">GST: <span className="font-semibold">₹{gstAmount.toLocaleString('en-IN')}</span></div>}
                <div className="text-lg font-bold">Total: ₹{total.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due Date"><Input type="date" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} /></Field>
            <Field label="Notes"><Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Optional notes for invoice" /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}><FileDown className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save & Generate PDF'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =================== BRANDING ===================
function BrandingView({ user }) {
  const { call } = useApi();
  const [b, setB] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setB((await call('branding')).branding); } catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  function onLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { toast.error('Logo must be < 500KB. Compress and retry.'); return; }
    const reader = new FileReader();
    reader.onload = () => setB(prev => ({ ...prev, logoBase64: reader.result }));
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    try { await call('branding', { method: 'PUT', body: b }); toast.success('Branding saved'); }
    catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (!b) return <div>Loading...</div>;
  return (
    <div className="space-y-4">
      <PageHeader title="Custom Branding" subtitle="Logo, firm details, bank info — appears on all PDFs" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Firm Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Firm Name"><Input value={b.firmName || ''} onChange={e => setB({ ...b, firmName: e.target.value })} /></Field>
              <Field label="GSTIN"><Input value={b.firmGstin || ''} onChange={e => setB({ ...b, firmGstin: e.target.value })} /></Field>
              <Field label="Email"><Input value={b.firmEmail || ''} onChange={e => setB({ ...b, firmEmail: e.target.value })} /></Field>
              <Field label="Phone"><Input value={b.firmPhone || ''} onChange={e => setB({ ...b, firmPhone: e.target.value })} /></Field>
              <Field label="Address" className="col-span-2"><Textarea rows={2} value={b.firmAddress || ''} onChange={e => setB({ ...b, firmAddress: e.target.value })} /></Field>
              <Field label="Contact Line (printed on PDF)" className="col-span-2"><Input value={b.firmContact || ''} onChange={e => setB({ ...b, firmContact: e.target.value })} /></Field>
            </div>
            <Separator />
            <div className="font-semibold">Bank / UPI (printed on Invoice PDFs)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank Name"><Input value={b.bankName || ''} onChange={e => setB({ ...b, bankName: e.target.value })} /></Field>
              <Field label="Account Number"><Input value={b.bankAccount || ''} onChange={e => setB({ ...b, bankAccount: e.target.value })} /></Field>
              <Field label="IFSC"><Input value={b.bankIfsc || ''} onChange={e => setB({ ...b, bankIfsc: e.target.value })} /></Field>
              <Field label="UPI ID"><Input value={b.upiId || ''} onChange={e => setB({ ...b, upiId: e.target.value })} /></Field>
            </div>
            <Field label="PDF Footer Text"><Input value={b.footerText || ''} onChange={e => setB({ ...b, footerText: e.target.value })} /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Logo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-square border-2 border-dashed rounded-lg flex items-center justify-center bg-slate-50">
              {b.logoBase64 ? <img src={b.logoBase64} alt="logo" className="max-h-full max-w-full p-4" /> : <span className="text-slate-400 text-sm">No logo uploaded</span>}
            </div>
            <label className="block">
              <span className="sr-only">Upload logo</span>
              <input type="file" accept="image/png,image/jpeg" onChange={onLogoChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
            </label>
            <p className="text-xs text-slate-500">PNG/JPG, square, max 500KB. Auto-embedded into invoice/quotation PDFs.</p>
            {b.logoBase64 && <Button variant="outline" size="sm" onClick={() => setB({ ...b, logoBase64: '' })}>Remove Logo</Button>}
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">{saving ? 'Saving...' : 'Save Branding'}</Button>
      </div>
    </div>
  );
}

// =================== RECEIVABLES (AGING) ===================
function ReceivablesView({ user, setView }) {
  const { call } = useApi();
  const [data, setData] = useState(null);
  const [sortField, setSortField] = useState('total');
  const [sortOrder, setSortOrder] = useState('desc');
  const [ledgerClientId, setLedgerClientId] = useState(null);
  const [invoiceClientId, setInvoiceClientId] = useState(null);
  const [adjClient, setAdjClient] = useState(null);
  const [branding, setBranding] = useState({});

  useEffect(() => {
    call('branding').then(b => setBranding(b.branding || {})).catch(() => {});
  }, []);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const sortedClients = useMemo(() => {
    if (!data || !data.perClient) return [];
    return [...data.perClient].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc'
          ? (valA > valB ? 1 : -1)
          : (valB > valA ? 1 : -1);
      }
    });
  }, [data, sortField, sortOrder]);

  async function load() {
    try { setData(await call('reports/aging')); }
    catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  if (!data) return <div className="text-slate-500">Loading report...</div>;

  const t = data.totals;
  const buckets = [
    { key: 'current', label: 'Current (Not Due)', color: '#10b981', fill: 'bg-emerald-500', text: 'text-emerald-700' },
    { key: 'b30', label: '1-30 Days', color: '#f59e0b', fill: 'bg-amber-500', text: 'text-amber-700' },
    { key: 'b60', label: '31-60 Days', color: '#f97316', fill: 'bg-orange-500', text: 'text-orange-700' },
    { key: 'b90', label: '61-90 Days', color: '#ef4444', fill: 'bg-red-500', text: 'text-red-700' },
    { key: 'b90plus', label: '90+ Days', color: '#991b1b', fill: 'bg-red-900', text: 'text-red-900' },
  ];

  // Stacked horizontal bar per client (top 10)
  const top = data.perClient.slice(0, 10);

  function doExport() {
    const rows = data.perClient.map(r => ({
      Client: r.clientName,
      Company: r.companyName,
      'Opening Balance': r.openingBalance,
      'As On': r.openingAsOn,
      'Current': r.current,
      '1-30 Days': r.b30,
      '31-60 Days': r.b60,
      '61-90 Days': r.b90,
      '90+ Days': r.b90plus,
      'Total Due': r.total,
      'Unpaid Invoices': r.unpaidInvoiceCount,
      'Oldest Due': r.oldestInvoiceDate,
    }));
    exportToExcel(rows, `aging_report_${data.asOn}.xlsx`);
    toast.success(`Exported ${rows.length} clients`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Receivables — Aging Report"
        subtitle={`As on ${data.asOn} • Total outstanding: ₹${t.total.toLocaleString('en-IN')}`}
        action={<Button variant="outline" onClick={doExport}><FileSpreadsheet className="w-4 h-4 mr-2" />Export</Button>}
      />

      {/* Bucket summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {buckets.map(b => {
          const val = t[b.key] || 0;
          const pct = t.total > 0 ? (val / t.total * 100) : 0;
          return (
            <Card key={b.key} className="overflow-hidden">
              <div className={`h-1 ${b.fill}`} />
              <CardContent className="p-4">
                <div className="text-xs text-slate-500 mb-1">{b.label}</div>
                <div className={`text-2xl font-bold ${b.text}`}>₹{val.toLocaleString('en-IN')}</div>
                <div className="text-xs text-slate-500 mt-1">{pct.toFixed(1)}% of total</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {data.perClient.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-slate-500">
            🎉 No outstanding receivables. All clients are paid up!
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Aging chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aging Distribution</CardTitle>
                <CardDescription>Total receivables by bucket</CardDescription>
              </CardHeader>
              <CardContent>
                <AgingPieChart totals={t} buckets={buckets} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 Clients by Outstanding</CardTitle>
                <CardDescription>Stacked by aging bucket</CardDescription>
              </CardHeader>
              <CardContent>
                <AgingBarChart clients={top} buckets={buckets} />
              </CardContent>
            </Card>
          </div>

          {/* Per-client table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client-wise Aging Detail</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader label="Client" field="clientName" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Current" field="current" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                    <SortableHeader label="1-30 d" field="b30" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                    <SortableHeader label="31-60 d" field="b60" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                    <SortableHeader label="61-90 d" field="b90" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                    <SortableHeader label="90+ d" field="b90plus" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                    <SortableHeader label="Total Due" field="total" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right font-bold" />
                    <SortableHeader label="Oldest" field="oldestInvoiceDate" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedClients.map(r => (
                    <TableRow key={r.clientId} className="hover:bg-slate-50 cursor-pointer" onClick={() => r.clientId && !r.clientId.startsWith('_orphan_') && setLedgerClientId(r.clientId)}>
                      <TableCell>
                        <div className="font-medium text-indigo-600 hover:underline">{r.clientName}</div>
                        {r.companyName && <div className="text-xs text-slate-500">{r.companyName}</div>}
                        {r.openingBalance > 0 && (
                          <div className="text-[10px] text-amber-700 mt-0.5">
                            Incl. opening ₹{r.openingBalance.toLocaleString('en-IN')} (as on {r.openingAsOn})
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.current > 0 ? `₹${r.current.toLocaleString('en-IN')}` : '-'}</TableCell>
                      <TableCell className="text-right text-sm text-amber-700">{r.b30 > 0 ? `₹${r.b30.toLocaleString('en-IN')}` : '-'}</TableCell>
                      <TableCell className="text-right text-sm text-orange-700">{r.b60 > 0 ? `₹${r.b60.toLocaleString('en-IN')}` : '-'}</TableCell>
                      <TableCell className="text-right text-sm text-red-700">{r.b90 > 0 ? `₹${r.b90.toLocaleString('en-IN')}` : '-'}</TableCell>
                      <TableCell className="text-right text-sm text-red-900 font-semibold">{r.b90plus > 0 ? `₹${r.b90plus.toLocaleString('en-IN')}` : '-'}</TableCell>
                      <TableCell className="text-right font-bold">₹{r.total.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-xs text-slate-500">{r.oldestInvoiceDate || '-'}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {r.clientId && !r.clientId.startsWith('_orphan_') && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                onClick={() => setInvoiceClientId(r.clientId)}
                                title="Generate Invoice for client"
                              >
                                <FilePlus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Invoice</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 gap-1 border-amber-200 text-amber-800 hover:bg-amber-50"
                                onClick={() => setAdjClient({ id: r.clientId, name: r.clientName, company: r.companyName })}
                                title="Direct Debit or Credit Ledger Entry"
                              >
                                <PlusCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span className="hidden sm:inline">Debit/Credit</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setLedgerClientId(r.clientId)}
                                title="View Client Ledger"
                              >
                                <Receipt className="w-4 h-4 text-slate-600" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-100 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">₹{t.current.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-amber-700">₹{t.b30.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-orange-700">₹{t.b60.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-red-700">₹{t.b90.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-red-900">₹{t.b90plus.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-lg">₹{t.total.toLocaleString('en-IN')}</TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {ledgerClientId && (
        <ClientLedger
          clientId={ledgerClientId}
          onClose={() => { setLedgerClientId(null); load(); }}
          user={user}
        />
      )}
      {invoiceClientId && (
        <InvoiceForm
          initialClientId={invoiceClientId}
          branding={branding}
          onClose={() => setInvoiceClientId(null)}
          onSaved={(inv) => { setInvoiceClientId(null); load(); generateInvoicePDF(inv, branding); }}
        />
      )}
      {adjClient && (
        <LedgerAdjustmentForm
          clientId={adjClient.id}
          client={adjClient}
          onClose={() => setAdjClient(null)}
          onSaved={() => { setAdjClient(null); load(); }}
        />
      )}
    </div>
  );
}

function AgingPieChart({ totals, buckets }) {
  // Lazy load recharts
  const [Recharts, setRecharts] = useState(null);
  useEffect(() => { import('recharts').then(m => setRecharts(m)); }, []);
  if (!Recharts) return <div className="h-72 flex items-center justify-center text-slate-400">Loading chart...</div>;
  const { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } = Recharts;
  const data = buckets.map(b => ({ name: b.label, value: totals[b.key] || 0, color: b.color })).filter(d => d.value > 0);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function AgingBarChart({ clients, buckets }) {
  const [Recharts, setRecharts] = useState(null);
  useEffect(() => { import('recharts').then(m => setRecharts(m)); }, []);
  if (!Recharts) return <div className="h-72 flex items-center justify-center text-slate-400">Loading chart...</div>;
  const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } = Recharts;
  const data = clients.map(c => ({
    name: c.clientName.length > 14 ? c.clientName.slice(0, 13) + '...' : c.clientName,
    'Current': c.current, '1-30d': c.b30, '31-60d': c.b60, '61-90d': c.b90, '90+d': c.b90plus,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
        <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Bar dataKey="Current" stackId="a" fill={buckets[0].color} />
        <Bar dataKey="1-30d" stackId="a" fill={buckets[1].color} />
        <Bar dataKey="31-60d" stackId="a" fill={buckets[2].color} />
        <Bar dataKey="61-90d" stackId="a" fill={buckets[3].color} />
        <Bar dataKey="90+d" stackId="a" fill={buckets[4].color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// =================== COMPLIANCES ===================
const ALL_PERMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'leads', label: 'Leads' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'clients', label: 'Clients' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'receivables', label: 'Receivables' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'compliances', label: 'Compliances' },
];

function PermissionsDialog({ target, onClose }) {
  const { call } = useApi();
  const [perms, setPerms] = useState({ ...(target.permissions || {}) });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await call(`users/${target.id}/permissions`, { method: 'PUT', body: { permissions: perms } });
      toast.success('Permissions updated. User must log out and back in for changes to apply.');
      onClose();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Module Access — {target.name}</DialogTitle>
          <DialogDescription>
            Toggle module visibility for this user. Admins always have access to everything.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ALL_PERMS.map(p => {
            const enabled = perms[p.key] !== false;
            return (
              <label key={p.key} className="flex items-center justify-between border rounded-md p-3 cursor-pointer hover:bg-slate-50">
                <span className="text-sm font-medium">{p.label}</span>
                <Switch checked={enabled} onCheckedChange={v => setPerms({ ...perms, [p.key]: v })} />
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Permissions'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrgAccessDialog({ target, onClose }) {
  const { call } = useApi();
  const [organisations, setOrganisations] = useState([]);
  const [allowedOrgIds, setAllowedOrgIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const orgData = await call('organisations?all=true');
      if (orgData.organisations) {
        setOrganisations(orgData.organisations);
      }
      const userOrgs = target.orgs || [];
      setAllowedOrgIds(userOrgs.map(o => o.orgId));
    } catch (e) {
      toast.error(e.message || 'Failed to load organization data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await call(`users/${target.id}`, {
        method: 'PUT',
        body: { allowedOrgIds }
      });
      toast.success('Organization access updated successfully');
      onClose();
    } catch (e) {
      toast.error(e.message || 'Failed to update access');
    } finally {
      setSaving(false);
    }
  }

  function toggleOrg(orgId) {
    if (allowedOrgIds.includes(orgId)) {
      setAllowedOrgIds(allowedOrgIds.filter(id => id !== orgId));
    } else {
      setAllowedOrgIds([...allowedOrgIds, orgId]);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Organization Access — {target.name}</DialogTitle>
          <DialogDescription>
            Enable or disable this user&apos;s access to different organizations in the system.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-slate-500 text-sm">Loading organizations...</div>
        ) : (
          <div className="space-y-3 py-2">
            {organisations.length === 0 ? (
              <div className="text-center text-slate-500 py-4 text-xs">No organizations found.</div>
            ) : (
              organisations.map(org => {
                const isEnabled = allowedOrgIds.includes(org.id);
                return (
                  <label key={org.id} className="flex items-center justify-between border rounded-md p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-700">{org.name}</span>
                      <span className="text-[10px] text-slate-400">ID: {org.id}</span>
                    </div>
                    <Switch checked={isEnabled} onCheckedChange={() => toggleOrg(org.id)} />
                  </label>
                );
              })
            )}
          </div>
        )}
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Saving...' : 'Save Access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompliancesView({ user }) {
  const { call } = useApi();
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [assignOpen, setAssignOpen] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc'
          ? (valA > valB ? 1 : -1)
          : (valB > valA ? 1 : -1);
      }
    });
  }, [items, sortField, sortOrder]);

  async function load() {
    try {
      const [c, cl] = await Promise.all([call('compliances'), call('clients')]);
      setItems(c.compliances || []);
      setClients(cl.clients || []);
    } catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function del(id) {
    if (!confirm('Delete this compliance? It will be removed from all clients.')) return;
    try { await call(`compliances/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compliances"
        subtitle={`${items.length} compliance types — click to see applicable clients`}
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New Compliance</Button>}
      />
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader label="Compliance" field="name" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Frequency" field="frequency" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Applicable Clients" field="clientCount" currentField={sortField} currentOrder={sortOrder} onSort={handleSort} className="text-right" />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map(c => (
                <>
                  <TableRow key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <TableCell>
                      <div className="font-medium text-indigo-600">{c.name}</div>
                      {c.description && <div className="text-xs text-slate-500">{c.description}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{c.frequency || '-'}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{c.clientCount}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setAssignOpen(c); }} title="Manage applicable clients">
                        <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(c); setOpen(true); }}><Edit className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); del(c.id); }}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </TableCell>
                  </TableRow>
                  {expanded === c.id && (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-slate-50">
                        {c.applicableClients.length === 0 ? (
                          <div className="text-sm text-slate-500 py-2">No clients have been marked applicable. Click 📋 icon above to assign clients.</div>
                        ) : (
                          <div className="py-2">
                             <div className="text-sm font-semibold mb-2">Clients applicable for {c.name}:</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {c.applicableClients.map(cl => (
                                <div key={cl.id} className="bg-white border rounded p-2 text-sm">
                                  <div className="font-medium">{cl.name}</div>
                                  {cl.company && <div className="text-xs text-slate-500">{cl.company}</div>}
                                  {cl.gstin && <div className="text-[10px] font-mono text-slate-500">GSTIN: {cl.gstin}</div>}
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 text-right">
                              <Button size="sm" variant="outline" onClick={() => exportToExcel(c.applicableClients.map(cl => ({ Name: cl.name, Company: cl.company, GSTIN: cl.gstin })), `${c.name.replace(/\s+/g,'_')}_clients.xlsx`)}>
                                <FileSpreadsheet className="w-4 h-4 mr-2" />Export List
                              </Button>
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {!sortedItems.length && <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-8">No compliances yet. Add one (e.g., &quot;GSTR-3B Monthly&quot;, &quot;Annual Audit&quot;) to start tracking.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {open && <ComplianceForm initial={editing} onClose={() => { setOpen(false); setEditing(null); }} onSaved={() => { setOpen(false); setEditing(null); load(); }} />}
      {assignOpen && <ComplianceClientsDialog compliance={assignOpen} clients={clients} onClose={() => setAssignOpen(null)} onSaved={() => { setAssignOpen(null); load(); }} />}
    </div>
  );
}

function ComplianceForm({ initial, onClose, onSaved }) {
  const { call } = useApi();
  const [f, setF] = useState(initial || { name: '', description: '', frequency: 'monthly' });
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try {
      if (initial) await call(`compliances/${initial.id}`, { method: 'PUT', body: f });
      else await call('compliances', { method: 'POST', body: f });
      toast.success(initial ? 'Compliance updated' : 'Compliance added');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>{initial ? 'Edit Compliance' : 'New Compliance'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name * (e.g., GSTR-3B, TDS Quarterly, Annual ITR)">
            <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
          </Field>
          <Field label="Description"><Textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Frequency">
            <Select value={f.frequency} onValueChange={v => setF({ ...f, frequency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['one-time', 'daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'].map(s =>
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ComplianceClientsDialog({ compliance, clients, onClose, onSaved }) {
  const { call } = useApi();
  const initial = new Set(compliance.applicableClients.map(c => c.id));
  const [selected, setSelected] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  const filtered = clients.filter(c => !q || `${c.name} ${c.company || ''} ${c.gstin || ''}`.toLowerCase().includes(q.toLowerCase()));

  function toggle(cid) {
    const next = new Set(selected);
    if (next.has(cid)) next.delete(cid); else next.add(cid);
    setSelected(next);
  }

  async function save() {
    setSaving(true);
    try {
      // For each client, set their applicableCompliances list (add or remove this compliance)
      // We'll do it efficiently: load current value and update
      for (const cl of clients) {
        const has = (cl.applicableCompliances || []).includes(compliance.id);
        const wants = selected.has(cl.id);
        if (has === wants) continue;
        const newList = wants
          ? [...(cl.applicableCompliances || []), compliance.id]
          : (cl.applicableCompliances || []).filter(x => x !== compliance.id);
        await call(`clients/${cl.id}`, { method: 'PUT', body: { applicableCompliances: newList } });
      }
      toast.success(`Updated client list for ${compliance.name}`);
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Applicable Clients — {compliance.name}</DialogTitle>
          <DialogDescription>Tick the clients to which this compliance applies. {selected.size} selected.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <Input className="pl-9" placeholder="Search clients..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="border rounded-md max-h-96 overflow-y-auto">
          {filtered.length === 0 && <div className="p-4 text-sm text-slate-500 text-center">No clients found.</div>}
          {filtered.map(cl => (
            <label key={cl.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={selected.has(cl.id)} onChange={() => toggle(cl.id)} />
              <div className="flex-1">
                <div className="text-sm font-medium">{cl.name}</div>
                {cl.company && <div className="text-xs text-slate-500">{cl.company}</div>}
              </div>
              {cl.gstin && <div className="text-[10px] font-mono text-slate-400">{cl.gstin}</div>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Applicability'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientImportDialog({ onClose, onImported }) {
  const { call } = useApi();
  const [step, setStep] = useState('upload'); // upload | preview | result
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState('');

  async function downloadSample() {
    const XLSX = await import('xlsx');
    const sample = [
      {
        Name: 'Acme Industries Pvt Ltd',
        Company: 'Acme Industries',
        Phone: '9876543210',
        Email: 'finance@acme.com',
        Address: '123 Business Park, Mumbai - 400001',
        GSTIN: '27AABCA1234Z1Z5',
        PAN: 'AABCA1234Z',
        OpeningBalance: 50000,
        AsOn: '2026-04-01',
        Notes: 'Long-term retainer client',
      },
      {
        Name: 'Beta Trading Co',
        Company: '',
        Phone: '9123456780',
        Email: 'beta@example.com',
        Address: '',
        GSTIN: '',
        PAN: '',
        OpeningBalance: 0,
        AsOn: '2026-04-01',
        Notes: '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample, {
      header: ['Name', 'Company', 'Phone', 'Email', 'Address', 'GSTIN', 'PAN', 'OpeningBalance', 'AsOn', 'Notes'],
    });
    // Column widths
    ws['!cols'] = [
      { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 32 },
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 28 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');

    // Add an Instructions sheet
    const instructions = [
      ['Field', 'Required', 'Description', 'Example'],
      ['Name', 'YES', 'Client name (individual or contact person). Duplicates are detected via Name+Phone.', 'Acme Industries Pvt Ltd'],
      ['Company', 'No', 'Company or business name', 'Acme Industries'],
      ['Phone', 'No', 'Mobile or contact number (10 digits)', '9876543210'],
      ['Email', 'No', 'Primary email', 'finance@acme.com'],
      ['Address', 'No', 'Billing / mailing address', '123 Business Park, Mumbai'],
      ['GSTIN', 'No', 'Goods & Services Tax Identification Number (15 chars). Duplicates are detected.', '27AABCA1234Z1Z5'],
      ['PAN', 'No', 'Permanent Account Number (10 chars)', 'AABCA1234Z'],
      ['OpeningBalance', 'No', 'Outstanding amount the client owes (in ₹). 0 if none.', '50000'],
      ['AsOn', 'No', 'Date for the opening balance. Accepts YYYY-MM-DD, DD/MM/YYYY, or Excel date.', '2026-04-01'],
      ['Notes', 'No', 'Any additional remarks', 'Long-term retainer'],
      [''],
      ['Tips:', '', '', ''],
      ['1. Keep header row exactly as in the Clients sheet.', '', '', ''],
      ['2. The Name column cannot be empty.', '', '', ''],
      ['3. Rows with duplicate Name+Phone or duplicate GSTIN are skipped by default.', '', '', ''],
      ['4. Dates are auto-normalized but YYYY-MM-DD is recommended.', '', '', ''],
    ];
    const wsI = XLSX.utils.aoa_to_sheet(instructions);
    wsI['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 55 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');

    XLSX.writeFile(wb, 'client_import_template.xlsx');
    toast.success('Sample template downloaded');
  }

  async function handleFile(e) {
    setParseError('');
    setParsedRows([]);
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    try {
      const XLSX = await import('xlsx');
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      // Use first sheet
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) {
        setParseError('No rows found in the first sheet.');
        return;
      }
      // Validate at least one of the expected columns exists
      const firstRow = rows[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase());
      if (!keys.includes('name')) {
        setParseError('Could not find a "Name" column. Please use the sample template.');
        return;
      }
      setParsedRows(rows);
      setStep('preview');
    } catch (err) {
      setParseError('Failed to read file: ' + (err.message || ''));
    }
  }

  async function doImport() {
    setImporting(true);
    try {
      const res = await call('clients/bulk-import', {
        method: 'POST',
        body: { rows: parsedRows, skipDuplicates },
      });
      setResult(res);
      setStep('result');
      toast.success(`Imported ${res.inserted} of ${res.total} clients`);
    } catch (e) {
      toast.error('Import failed: ' + (e.message || ''));
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep('upload');
    setParsedRows([]);
    setFileName('');
    setResult(null);
    setParseError('');
  }

  const validRows = parsedRows.filter(r => String(r.Name || r.name || '').trim());
  const invalidCount = parsedRows.length - validRows.length;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-600" /> Import Clients from Excel
          </DialogTitle>
          <DialogDescription>
            Bulk-add clients by uploading an Excel (.xlsx) or CSV file. Download the sample template to get started.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-indigo-50 border-indigo-200 p-4">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-indigo-900">Step 1 — Download the sample template</div>
                    <div className="text-sm text-indigo-700 mt-1">
                      The template has a <b>Clients</b> sheet with column headers and example rows, plus an <b>Instructions</b> sheet explaining every field.
                    </div>
                    <Button size="sm" variant="outline" className="mt-3 bg-white" onClick={downloadSample}>
                      <FileDown className="w-4 h-4 mr-2" /> Download client_import_template.xlsx
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-medium mb-2">Step 2 — Upload your filled file</div>
                <Input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={handleFile} />
                {fileName && !parseError && <div className="text-xs text-slate-500 mt-2">Selected: {fileName}</div>}
                {parseError && <div className="text-sm text-red-600 mt-2">{parseError}</div>}
              </div>

              <div className="rounded-lg bg-slate-50 border p-3 text-xs text-slate-600">
                <div className="font-medium text-slate-800 mb-1">Supported columns (header names are case-insensitive):</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>• <b>Name</b> <span className="text-red-600">(required)</span></div>
                  <div>• Company</div>
                  <div>• Phone</div>
                  <div>• Email</div>
                  <div>• Address</div>
                  <div>• GSTIN</div>
                  <div>• PAN</div>
                  <div>• OpeningBalance</div>
                  <div>• AsOn (date)</div>
                  <div>• Notes</div>
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium">Preview — {parsedRows.length} rows parsed</div>
                  <div className="text-xs text-slate-500">
                    {validRows.length} valid • {invalidCount > 0 && <span className="text-amber-600">{invalidCount} missing Name (will be skipped)</span>}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
                  <span>Skip duplicates (Name+Phone or GSTIN)</span>
                </label>
              </div>

              <div className="overflow-x-auto border rounded-md max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0">
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>GSTIN</TableHead>
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 200).map((r, i) => {
                      const name = String(r.Name || r.name || '').trim();
                      const ok = !!name;
                      return (
                        <TableRow key={i} className={ok ? '' : 'bg-red-50'}>
                          <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                          <TableCell className="font-medium">{name || <em className="text-red-600">— missing —</em>}</TableCell>
                          <TableCell className="text-sm">{r.Company || r.company || ''}</TableCell>
                          <TableCell className="text-sm">{r.Phone || r.phone || ''}</TableCell>
                          <TableCell className="text-xs font-mono">{r.GSTIN || r.gstin || ''}</TableCell>
                          <TableCell className="text-right text-sm">{Number(r.OpeningBalance || r.openingBalance || 0).toLocaleString('en-IN')}</TableCell>
                          <TableCell>{ok ? <Badge variant="outline" className="text-emerald-700 border-emerald-300">Ready</Badge> : <Badge variant="outline" className="text-red-700 border-red-300">Skip</Badge>}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.length > 200 && <div className="text-xs text-slate-500">Showing first 200 of {parsedRows.length} rows.</div>}
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="border rounded-md p-3 text-center">
                  <div className="text-2xl font-bold">{result.total}</div>
                  <div className="text-xs text-slate-500">Total Rows</div>
                </div>
                <div className="border rounded-md p-3 text-center bg-emerald-50 border-emerald-200">
                  <div className="text-2xl font-bold text-emerald-700">{result.inserted}</div>
                  <div className="text-xs text-emerald-700">Imported</div>
                </div>
                <div className="border rounded-md p-3 text-center bg-amber-50 border-amber-200">
                  <div className="text-2xl font-bold text-amber-700">{result.skipped}</div>
                  <div className="text-xs text-amber-700">Skipped</div>
                </div>
                <div className="border rounded-md p-3 text-center bg-red-50 border-red-200">
                  <div className="text-2xl font-bold text-red-700">{result.errors}</div>
                  <div className="text-xs text-red-700">Errors</div>
                </div>
              </div>

              {result.details?.skipped?.length > 0 && (
                <div>
                  <div className="font-medium text-sm mb-1">Skipped rows</div>
                  <div className="max-h-32 overflow-y-auto text-xs bg-amber-50 border border-amber-200 rounded-md p-2 font-mono">
                    {result.details.skipped.map((s, i) => (
                      <div key={i}>Row {s.row}: {s.name} — {s.reason}</div>
                    ))}
                  </div>
                </div>
              )}
              {result.details?.errors?.length > 0 && (
                <div>
                  <div className="font-medium text-sm mb-1">Errors</div>
                  <div className="max-h-32 overflow-y-auto text-xs bg-red-50 border border-red-200 rounded-md p-2 font-mono">
                    {result.details.errors.map((s, i) => (
                      <div key={i}>Row {s.row}: {s.name || ''} — {s.reason}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3 mt-2">
          {step === 'upload' && (
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={reset} disabled={importing}>Back</Button>
              <Button onClick={doImport} disabled={importing || !validRows.length}>
                {importing ? 'Importing...' : `Import ${validRows.length} client${validRows.length === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
          {step === 'result' && (
            <>
              <Button variant="outline" onClick={reset}>Import Another File</Button>
              <Button onClick={onImported}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BackupView({ user }) {
  const { call } = useApi();
  const [exporting, setExporting] = useState(false);
  const [includeLogs, setIncludeLogs] = useState(true);
  const [includePasswords, setIncludePasswords] = useState(true);

  const [importFile, setImportFile] = useState(null);
  const [importPayload, setImportPayload] = useState(null);
  const [importMode, setImportMode] = useState('merge'); // 'merge' | 'replace'
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [parseError, setParseError] = useState('');

  // Clear data states
  const [clearDate, setClearDate] = useState('');
  const [clearCategories, setClearCategories] = useState({
    tasks: true,
    leads: true,
    invoices_payments: true,
    quotations: true,
    activity_logs: false,
    compliances: false,
  });
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState(null);

  async function handleClearOldData() {
    const selectedCats = Object.keys(clearCategories).filter(k => clearCategories[k]);
    if (!clearDate) {
      toast.error('Please select an as-on date');
      return;
    }
    if (selectedCats.length === 0) {
      toast.error('Please select at least one category to clear');
      return;
    }
    if (clearConfirmText.trim().toUpperCase() !== 'CLEAR') {
      toast.error('Please type CLEAR to confirm');
      return;
    }

    setClearing(true);
    try {
      const res = await call('backup/clear-old-data', {
        method: 'POST',
        body: { asOnDate: clearDate, categories: selectedCats },
      });
      setClearResult(res.summary);
      toast.success('Old data cleared successfully!');
      setClearDialogOpen(false);
      setClearConfirmText('');
    } catch (e) {
      toast.error('Failed to clear old data: ' + (e.message || ''));
    } finally {
      setClearing(false);
    }
  }

  if (user.role !== 'admin') {
    return (
      <Card>
        <CardContent className="p-8 text-center text-slate-500">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <div className="font-medium">Admin access required</div>
          <div className="text-sm">Only administrators can manage backups.</div>
        </CardContent>
      </Card>
    );
  }

  async function handleExport() {
    setExporting(true);
    try {
      const token = localStorage.getItem('ca_token');
      const qs = new URLSearchParams({
        includeLogs: String(includeLogs),
        includePasswords: String(includePasswords),
      }).toString();
      const res = await fetch(`/api/backup/export?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      a.download = m ? m[1] : `ca-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch (e) {
      toast.error('Export failed: ' + (e.message || ''));
    } finally {
      setExporting(false);
    }
  }

  function handleFile(e) {
    setParseError('');
    setImportPayload(null);
    const f = e.target.files?.[0];
    if (!f) { setImportFile(null); return; }
    setImportFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || !parsed.data) {
          setParseError('Invalid backup file: missing "data" section');
          return;
        }
        setImportPayload(parsed);
      } catch (err) {
        setParseError('Could not parse JSON: ' + err.message);
      }
    };
    reader.readAsText(f);
  }

  async function doImport() {
    if (!importPayload) return;
    setImporting(true);
    try {
      const res = await call('backup/import', {
        method: 'POST',
        body: { mode: importMode, payload: importPayload },
      });
      setLastResult(res);
      toast.success(`Import complete (${importMode})`);
      setConfirmOpen(false);
      setImportFile(null);
      setImportPayload(null);
    } catch (e) {
      toast.error('Import failed: ' + (e.message || ''));
    } finally {
      setImporting(false);
    }
  }

  const counts = importPayload?.meta?.counts || {};
  const collectionsInBackup = importPayload ? Object.keys(importPayload.data || {}) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Database className="w-6 h-6 text-indigo-600" /> Backup & Restore
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Export your entire database to a single JSON file, then import it on a new instance to migrate seamlessly.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* EXPORT CARD */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-emerald-600" /> Export Full Backup
            </CardTitle>
            <CardDescription>
              Downloads a JSON file containing users, leads, tasks, clients, invoices, payments, quotations, compliances, branding & activity logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">Include activity logs</div>
                <div className="text-xs text-slate-500">Audit trail entries</div>
              </div>
              <Switch checked={includeLogs} onCheckedChange={setIncludeLogs} />
            </label>
            <label className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">Include password hashes</div>
                <div className="text-xs text-slate-500">Required to preserve user logins on the new instance</div>
              </div>
              <Switch checked={includePasswords} onCheckedChange={setIncludePasswords} />
            </label>
            <Button onClick={handleExport} disabled={exporting} className="w-full bg-emerald-600 hover:bg-emerald-700">
              <DownloadCloud className="w-4 h-4 mr-2" />
              {exporting ? 'Preparing backup...' : 'Download Backup (.json)'}
            </Button>
            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-md border">
              💡 Store this file securely. It contains sensitive information including hashed credentials.
            </div>
          </CardContent>
        </Card>

        {/* IMPORT CARD */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-indigo-600" /> Import / Restore
            </CardTitle>
            <CardDescription>
              Upload a previously exported backup file to restore data into this instance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">Backup file (.json)</Label>
              <Input type="file" accept="application/json,.json" onChange={handleFile} className="mt-1" />
              {parseError && <div className="text-xs text-red-600 mt-1">{parseError}</div>}
            </div>

            {importPayload && (
              <div className="border rounded-md p-3 bg-slate-50 text-sm space-y-2">
                <div className="font-medium text-slate-800">Backup preview</div>
                <div className="text-xs text-slate-600 grid grid-cols-2 gap-1">
                  <div>App: <span className="font-mono">{importPayload.meta?.appName || '—'}</span></div>
                  <div>Schema: <span className="font-mono">v{importPayload.meta?.schemaVersion ?? '?'}</span></div>
                  <div className="col-span-2">Exported: <span className="font-mono">{importPayload.meta?.exportedAt || '—'}</span></div>
                  <div className="col-span-2">By: <span className="font-mono">{importPayload.meta?.exportedBy?.email || '—'}</span></div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {collectionsInBackup.map(name => (
                    <div key={name} className="flex justify-between">
                      <span className="text-slate-600 capitalize">{name.replace('_', ' ')}</span>
                      <span className="font-mono text-slate-800">{(importPayload.data[name] || []).length}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm">Restore mode</Label>
              <Select value={importMode} onValueChange={setImportMode}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge — keep existing, upsert by ID (safer)</SelectItem>
                  <SelectItem value="replace">Replace — wipe each collection, then insert (full restore)</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500 mt-1">
                {importMode === 'replace'
                  ? '⚠️ Replace will DELETE all existing data in the imported collections before inserting. Your current admin account is preserved.'
                  : 'Merge will keep all existing data and overwrite records that share the same ID.'}
              </div>
            </div>

            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!importPayload || importing}
              className={`w-full ${importMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              <UploadCloud className="w-4 h-4 mr-2" />
              {importMode === 'replace' ? 'Restore (Replace All)' : 'Restore (Merge)'}
            </Button>
          </CardContent>
        </Card>

        {/* CLEAR OLD DATA CARD */}
        <Card className="border-red-200">
          <CardHeader className="bg-red-50/50">
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5 text-red-600" /> Clear Old Data
            </CardTitle>
            <CardDescription className="text-slate-500">
              Permanently delete historic/completed transactions and logs on or before a selected date.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div>
              <Label className="text-sm font-semibold">As On Date (inclusive)</Label>
              <Input
                type="date"
                value={clearDate}
                onChange={e => setClearDate(e.target.value)}
                className="mt-1 border-red-200 focus-visible:ring-red-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">All records matching the categories on or before this date will be deleted.</p>
            </div>

            <Separator className="my-1" />

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Categories to Clear</Label>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                <label className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0 cursor-pointer">
                  <div>
                    <div className="font-medium text-slate-700">Tasks</div>
                    <div className="text-[11px] text-slate-400">Tasks created or due on/before date</div>
                  </div>
                  <Switch
                    checked={clearCategories.tasks}
                    onCheckedChange={v => setClearCategories({ ...clearCategories, tasks: v })}
                  />
                </label>
                <label className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0 cursor-pointer">
                  <div>
                    <div className="font-medium text-slate-700">Leads</div>
                    <div className="text-[11px] text-slate-400">Leads created or followed up on/before date</div>
                  </div>
                  <Switch
                    checked={clearCategories.leads}
                    onCheckedChange={v => setClearCategories({ ...clearCategories, leads: v })}
                  />
                </label>
                <label className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0 cursor-pointer">
                  <div>
                    <div className="font-medium text-slate-700">Invoices & Payments</div>
                    <div className="text-[11px] text-slate-400">Invoices and payments up to date</div>
                  </div>
                  <Switch
                    checked={clearCategories.invoices_payments}
                    onCheckedChange={v => setClearCategories({ ...clearCategories, invoices_payments: v })}
                  />
                </label>
                <label className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0 cursor-pointer">
                  <div>
                    <div className="font-medium text-slate-700">Quotations</div>
                    <div className="text-[11px] text-slate-400">Quotations created on/before date</div>
                  </div>
                  <Switch
                    checked={clearCategories.quotations}
                    onCheckedChange={v => setClearCategories({ ...clearCategories, quotations: v })}
                  />
                </label>
                <label className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0 cursor-pointer">
                  <div>
                    <div className="font-medium text-slate-700">Compliances</div>
                    <div className="text-[11px] text-slate-400">Compliance checklist templates</div>
                  </div>
                  <Switch
                    checked={clearCategories.compliances}
                    onCheckedChange={v => setClearCategories({ ...clearCategories, compliances: v })}
                  />
                </label>
                <label className="flex items-center justify-between text-sm py-1 last:border-0 cursor-pointer">
                  <div>
                    <div className="font-medium text-slate-700">Activity Logs</div>
                    <div className="text-[11px] text-slate-400">System audit trail history</div>
                  </div>
                  <Switch
                    checked={clearCategories.activity_logs}
                    onCheckedChange={v => setClearCategories({ ...clearCategories, activity_logs: v })}
                  />
                </label>
              </div>
            </div>

            <Button
              variant="destructive"
              disabled={!clearDate || !Object.values(clearCategories).some(Boolean)}
              onClick={() => {
                setClearConfirmText('');
                setClearDialogOpen(true);
              }}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Selected Data
            </Button>
          </CardContent>
        </Card>
      </div>

      {clearResult && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Data Cleared Successfully
            </CardTitle>
            <CardDescription className="text-emerald-700">
              The following old records up to <b>{clearDate}</b> have been permanently deleted:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(clearResult).map(([name, count]) => (
                <div key={name} className="bg-white border rounded-md p-3 text-center shadow-sm">
                  <div className="text-xs text-slate-500 capitalize">{name.replace('_', ' ')}</div>
                  <div className="text-xl font-bold text-slate-800 font-mono mt-1">{count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Last Import Result
            </CardTitle>
            <CardDescription>Mode: <Badge variant="outline">{lastResult.mode}</Badge></CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collection</TableHead>
                    <TableHead className="text-right">In Backup</TableHead>
                    <TableHead className="text-right">Inserted</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                    <TableHead className="text-right">Skipped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(lastResult.summary || {}).map(([name, s]) => (
                    <TableRow key={name}>
                      <TableCell className="capitalize font-medium">{name.replace('_', ' ')}</TableCell>
                      <TableCell className="text-right font-mono">{s.total}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-700">{s.inserted}</TableCell>
                      <TableCell className="text-right font-mono text-indigo-700">{s.updated}</TableCell>
                      <TableCell className="text-right font-mono text-slate-500">{s.skipped}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-xs text-slate-500 mt-3">
              💡 Refresh the page or log out and back in to see all restored data correctly.
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Confirm Restore
            </DialogTitle>
            <DialogDescription>
              You are about to <b>{importMode === 'replace' ? 'REPLACE ALL DATA' : 'MERGE'}</b> using the uploaded backup.
              {importMode === 'replace' && ' Existing records will be deleted and replaced.'}
              {' '}This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm bg-slate-50 border rounded-md p-3 max-h-48 overflow-y-auto">
            <div className="font-medium mb-2">Counts to be restored:</div>
            {collectionsInBackup.map(name => (
              <div key={name} className="flex justify-between text-xs">
                <span className="capitalize">{name.replace('_', ' ')}</span>
                <span className="font-mono">{(importPayload?.data?.[name] || []).length}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={importing}>Cancel</Button>
            <Button
              onClick={doImport}
              disabled={importing}
              className={importMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}
            >
              {importing ? 'Restoring...' : (importMode === 'replace' ? 'Yes, Replace All' : 'Yes, Merge Data')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 text-red-500" /> Confirm Deletion
            </DialogTitle>
            <DialogDescription className="space-y-2 text-slate-500">
              <span>
                You are about to <b>PERMANENTLY DELETE</b> old records on or before <b>{clearDate}</b>.
              </span>
              <p className="text-red-700 font-semibold bg-red-50 p-2 rounded border border-red-100 text-xs">
                ⚠️ This operation is destructive and cannot be undone. Please ensure you have exported a full backup.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div>
              <span className="font-semibold text-slate-700">Categories to clear:</span>
              <ul className="list-disc pl-5 text-xs text-slate-600 mt-1 space-y-0.5">
                {Object.keys(clearCategories).filter(k => clearCategories[k]).map(k => (
                  <li key={k} className="capitalize">{k.replace('_', ' & ')}</li>
                ))}
              </ul>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">
                Type <span className="font-mono bg-red-100 text-red-800 px-1.5 py-0.5 rounded">CLEAR</span> to confirm:
              </Label>
              <Input
                value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                placeholder="CLEAR"
                className="font-mono text-center tracking-widest uppercase border-red-300 focus-visible:ring-red-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)} disabled={clearing}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleClearOldData}
              disabled={clearing || clearConfirmText.trim().toUpperCase() !== 'CLEAR'}
              className="bg-red-600 hover:bg-red-700"
            >
              {clearing ? 'Clearing Data...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrganisationsAdminView({ user }) {
  const { call } = useApi();
  const [organisations, setOrganisations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [orgName, setOrgName] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await call('organisations?all=true');
      if (data.organisations) {
        setOrganisations(data.organisations);
      }
    } catch (e) {
      toast.error(e.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await call(`organisations/${editing.id}`, {
          method: 'PUT',
          body: { name: orgName.trim() }
        });
        toast.success('Organization updated successfully');
      } else {
        await call('organisations', {
          method: 'POST',
          body: { name: orgName.trim() }
        });
        toast.success('Organization created successfully');
      }
      setOpen(false);
      setEditing(null);
      setOrgName('');
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to save organization');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, name) {
    if (user.activeOrgId === id) {
      toast.error('Cannot delete your active organization. Please switch to another organization first.');
      return;
    }
    if (!confirm(`Are you sure you want to delete the organization "${name}"? This will permanently delete all leads, tasks, clients, invoices, and payments associated with it and revoke access for all members!`)) {
      return;
    }
    try {
      await call(`organisations/${id}`, { method: 'DELETE' });
      toast.success('Organization and all its data deleted successfully');
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to delete organization');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Organizations Management"
        subtitle="View, create, rename, or delete all organizations across the entire system"
        action={
          <Button onClick={() => { setEditing(null); setOrgName(''); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />New Organization
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-8 text-center text-slate-500 text-sm">Loading organizations...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organisations.map(org => (
                  <TableRow key={org.id} className="hover:bg-slate-50">
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{org.name}</span>
                        {user.activeOrgId === org.id && (
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                            Active
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{org.id}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(org);
                          setOrgName(org.name);
                          setOpen(true);
                        }}
                        title="Rename Organization"
                      >
                        <Edit className="w-4 h-4 text-slate-600" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(org.id, org.name)}
                        title="Delete Organization"
                        disabled={user.activeOrgId === org.id}
                        className={user.activeOrgId === org.id ? 'opacity-40 cursor-not-allowed' : ''}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {organisations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                      No organizations found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {open && (
        <Dialog open onOpenChange={() => { if (!saving) { setOpen(false); setEditing(null); } }}>
          <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{editing ? 'Rename Organization' : 'Create New Organization'}</DialogTitle>
              <DialogDescription>
                {editing ? 'Change the name of the organization.' : 'Add a new organization to the practice management system.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSave}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name-modal">Organization Name</Label>
                  <Input
                    id="org-name-modal"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="Enter organization name"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); setEditing(null); }} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Organization'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


// =================== APPOINTMENTS ===================
function AppointmentsView({ user, viewParams = {}, setView }) {
  const { call } = useApi();
  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [viewMode, setViewMode] = useState(user.role === 'admin' ? 'all' : 'my');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedQ(q); }, 300);
    return () => clearTimeout(handler);
  }, [q]);

  async function loadUsersAndClients() {
    try {
      const [uRes, cRes] = await Promise.all([
        call('users'),
        call('clients')
      ]);
      if (uRes.users) setUsers(uRes.users);
      if (cRes.clients) setClients(cRes.clients);
    } catch (e) {
      console.error(e);
    }
  }

  async function load() {
    setLoading(true);
    try {
      let query = `appointments?limit=100&viewMode=${viewMode}`;
      if (debouncedQ) query += `&q=${encodeURIComponent(debouncedQ)}`;
      if (typeFilter !== 'all') query += `&type=${typeFilter}`;
      if (statusFilter !== 'all') query += `&status=${statusFilter}`;

      const todayStr = new Date().toISOString().slice(0, 10);
      if (dateFilter === 'today') {
        query += `&date=${todayStr}`;
      }

      const res = await call(query);
      let list = res.appointments || res.data || [];

      if (dateFilter === 'upcoming') {
        list = list.filter(a => a.date >= todayStr && a.status === 'Scheduled');
      } else if (dateFilter === 'this_month') {
        const currentMonthPrefix = todayStr.slice(0, 7);
        list = list.filter(a => (a.date || '').startsWith(currentMonthPrefix));
      }

      setAppointments(list);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsersAndClients();
  }, []);

  useEffect(() => {
    load();
  }, [debouncedQ, viewMode, typeFilter, statusFilter, dateFilter]);

  async function handleMarkCompleted(id) {
    try {
      await call(`appointments/${id}`, {
        method: 'PUT',
        body: { status: 'Completed' }
      });
      toast.success('Appointment marked as completed');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    try {
      await call(`appointments/${id}`, { method: 'DELETE' });
      toast.success('Appointment deleted');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  function openGoogleCalendar(a) {
    const title = encodeURIComponent(a.title || 'Appointment');
    const details = encodeURIComponent(`${a.notes || ''}\nClient: ${a.clientName || 'N/A'}\nAssigned Staff: ${(a.assignedUserNames || []).join(', ')}`);
    const location = encodeURIComponent(a.locationAddress || (a.type === 'in_office' ? 'Office' : 'Client Site'));

    const dStr = (a.date || new Date().toISOString().slice(0,10)).replace(/-/g, '');
    const sTime = (a.startTime || '10:00').replace(':', '') + '00';
    const eTime = (a.endTime || '11:00').replace(':', '') + '00';

    const dates = `${dStr}T${sTime}/${dStr}T${eTime}`;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
    window.open(url, '_blank');
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const totalCount = appointments.length;
  const inOfficeCount = appointments.filter(a => a.type === 'in_office').length;
  const clientVisitCount = appointments.filter(a => a.type === 'client_visit').length;
  const todayCount = appointments.filter(a => a.date === todayStr).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments & Visits"
        subtitle="Schedule and manage in-office meetings and client site visits across team members"
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Schedule Appointment
          </Button>
        }
      />

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3 bg-gradient-to-br from-indigo-50/50 to-white border-indigo-100">
          <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-700">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{totalCount}</div>
            <div className="text-xs font-medium text-slate-500">Total Listed</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 bg-gradient-to-br from-blue-50/50 to-white border-blue-100">
          <div className="p-2.5 rounded-lg bg-blue-100 text-blue-700">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-900">{inOfficeCount}</div>
            <div className="text-xs font-medium text-slate-500">In-Office Meetings</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 bg-gradient-to-br from-amber-50/50 to-white border-amber-100">
          <div className="p-2.5 rounded-lg bg-amber-100 text-amber-700">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-900">{clientVisitCount}</div>
            <div className="text-xs font-medium text-slate-500">Client Visits</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 bg-gradient-to-br from-emerald-50/50 to-white border-emerald-100">
          <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-700">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-900">{todayCount}</div>
            <div className="text-xs font-medium text-slate-500">Scheduled Today</div>
          </div>
        </Card>
      </div>

      {/* Filter and Control Bar */}
      <Card className="p-4 space-y-3 bg-slate-50/50">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search title, client, staff, location..."
              value={q}
              onChange={e => setQ(e.target.value)}
              className="pl-9 bg-white"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="bg-slate-200 p-0.5 rounded-lg flex items-center text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('my')}
                className={`px-3 py-1.5 rounded-md transition ${viewMode === 'my' ? 'bg-white text-indigo-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                My Appointments
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-3 py-1.5 rounded-md transition ${viewMode === 'all' ? 'bg-white text-indigo-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All Team ({users.length || 'Team'})
              </button>
            </div>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] bg-white h-9 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="in_office">🏢 In-Office</SelectItem>
                <SelectItem value="client_visit">🚗 Client Visit</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-white h-9 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Rescheduled">Rescheduled</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Filter */}
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px] bg-white h-9 text-xs">
                <SelectValue placeholder="All Dates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Appointments List Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="text-sm">Loading appointments...</span>
        </div>
      ) : appointments.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <CalendarCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 mb-1">No appointments found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {q || typeFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all'
              ? 'Try adjusting your search query or filters.'
              : 'Schedule your first in-office meeting or client site visit.'}
          </p>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }} className="bg-indigo-600 text-white">
            <Plus className="w-4 h-4 mr-1.5" /> Schedule Appointment
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {appointments.map(a => {
            const isToday = a.date === todayStr;
            const isCompleted = a.status === 'Completed';
            const isCancelled = a.status === 'Cancelled';

            return (
              <Card key={a.id} className={`flex flex-col justify-between hover:shadow-md transition-all border ${
                isToday ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-200 bg-white'
              }`}>
                <div className="p-4 space-y-3">
                  {/* Card Header Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className={
                      a.type === 'client_visit'
                        ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium text-[11px] gap-1'
                        : 'bg-indigo-50 text-indigo-800 border-indigo-200 font-medium text-[11px] gap-1'
                    }>
                      {a.type === 'client_visit' ? <MapPin className="w-3 h-3 text-amber-600" /> : <Building2 className="w-3 h-3 text-indigo-600" />}
                      {a.type === 'client_visit' ? 'Client Visit' : 'In-Office'}
                    </Badge>

                    <Badge className={`text-[11px] font-semibold ${
                      isCompleted ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                      isCancelled ? 'bg-red-100 text-red-800 border border-red-300' :
                      a.status === 'Rescheduled' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                      'bg-blue-100 text-blue-800 border border-blue-300'
                    }`}>
                      {a.status || 'Scheduled'}
                    </Badge>
                  </div>

                  {/* Title */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-base leading-snug">{a.title}</h4>
                    {a.clientName && (
                      <div className="text-xs font-semibold text-indigo-600 flex items-center gap-1 mt-1">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Client: {a.clientName}</span>
                      </div>
                    )}
                  </div>

                  {/* Date, Time & Location */}
                  <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</span>
                      {isToday && <Badge className="bg-indigo-600 text-white text-[9px] px-1.5 py-0">Today</Badge>}
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{a.startTime || '10:00'} - {a.endTime || '11:00'}</span>
                    </div>

                    {a.locationAddress && (
                      <div className="flex items-start gap-2 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{a.locationAddress}</span>
                      </div>
                    )}
                  </div>

                  {/* Assignees */}
                  <div className="pt-1">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-indigo-500" /> Assigned Staff:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(a.assignedUserNames && a.assignedUserNames.length ? a.assignedUserNames : [a.createdByName || 'Self']).map((name, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {a.notes && (
                    <div className="text-xs text-slate-500 bg-amber-50/50 p-2 rounded border border-amber-100/60 line-clamp-2">
                      <span className="font-semibold text-amber-900">Notes: </span>{a.notes}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 bg-slate-50 border-t flex items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                      onClick={() => openGoogleCalendar(a)}
                      title="Add to Google Calendar"
                    >
                      <Share2 className="w-3.5 h-3.5 mr-1" /> Calendar
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    {!isCompleted && !isCancelled && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                        onClick={() => handleMarkCompleted(a.id)}
                        title="Mark Completed"
                      >
                        <CheckSquare className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Done
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                      onClick={() => { setEditing(a); setOpen(true); }}
                      title="Edit Appointment"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    {(user.role === 'admin' || a.createdBy === user.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(a.id)}
                        title="Delete Appointment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Appointment Form Modal */}
      {open && (
        <AppointmentFormDialog
          appointmentToEdit={editing}
          clients={clients}
          users={users}
          currentUser={user}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSaved={() => { setOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function AppointmentFormDialog({ appointmentToEdit, clients = [], users = [], currentUser, onClose, onSaved }) {
  const { call } = useApi();
  const [f, setF] = useState({
    id: appointmentToEdit?.id,
    title: appointmentToEdit?.title || '',
    type: appointmentToEdit?.type || 'in_office',
    clientId: appointmentToEdit?.clientId || '',
    clientName: appointmentToEdit?.clientName || '',
    locationAddress: appointmentToEdit?.locationAddress || '',
    date: appointmentToEdit?.date || new Date().toISOString().slice(0, 10),
    startTime: appointmentToEdit?.startTime || '10:00',
    endTime: appointmentToEdit?.endTime || '11:00',
    status: appointmentToEdit?.status || 'Scheduled',
    assignedUserIds: appointmentToEdit?.assignedUserIds && appointmentToEdit.assignedUserIds.length ? appointmentToEdit.assignedUserIds : [currentUser.id],
    notes: appointmentToEdit?.notes || ''
  });
  const [saving, setSaving] = useState(false);

  function handleClientSelect(clientId) {
    if (!clientId) {
      setF(prev => ({ ...prev, clientId: '', clientName: '' }));
      return;
    }
    const c = clients.find(x => x.id === clientId);
    if (c) {
      setF(prev => ({
        ...prev,
        clientId: c.id,
        clientName: c.name,
        locationAddress: prev.type === 'client_visit' ? (c.address || c.company || prev.locationAddress) : prev.locationAddress
      }));
    }
  }

  function handleTypeChange(type) {
    setF(prev => {
      let loc = prev.locationAddress;
      if (type === 'in_office' && (!loc || (prev.clientId && loc === clients.find(c => c.id === prev.clientId)?.address))) {
        loc = 'Main Office — Meeting Room';
      } else if (type === 'client_visit' && prev.clientId) {
        const c = clients.find(x => x.id === prev.clientId);
        if (c && c.address) loc = c.address;
      }
      return { ...prev, type, locationAddress: loc };
    });
  }

  function toggleUserAssign(userId) {
    setF(prev => {
      const current = prev.assignedUserIds || [];
      if (current.includes(userId)) {
        if (current.length === 1) {
          toast.error('Appointment must have at least one assigned user');
          return prev;
        }
        return { ...prev, assignedUserIds: current.filter(id => id !== userId) };
      } else {
        return { ...prev, assignedUserIds: [...current, userId] };
      }
    });
  }

  function selectAllUsers() {
    setF(prev => ({ ...prev, assignedUserIds: users.map(u => u.id) }));
  }

  function selectSelfOnly() {
    setF(prev => ({ ...prev, assignedUserIds: [currentUser.id] }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim()) { toast.error('Title is required'); return; }
    if (!f.date) { toast.error('Date is required'); return; }
    if (!f.assignedUserIds || !f.assignedUserIds.length) { toast.error('Select at least one assigned user'); return; }

    setSaving(true);
    try {
      if (f.id) {
        await call(`appointments/${f.id}`, { method: 'PUT', body: f });
        toast.success('Appointment updated');
      } else {
        await call('appointments', { method: 'POST', body: f });
        toast.success('Appointment scheduled');
      }
      onSaved();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{f.id ? 'Edit Appointment' : 'Schedule New Appointment'}</DialogTitle>
          <DialogDescription>
            Record in-office client meetings or team site visits. Assign one or multiple staff members.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4 py-2">
          {/* Appointment Type Toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Appointment Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTypeChange('in_office')}
                className={`p-3 rounded-lg border text-left flex items-center gap-3 transition ${
                  f.type === 'in_office'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 ring-2 ring-indigo-500/20 font-semibold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className={`p-2 rounded-md ${f.type === 'in_office' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm">In-Office Meeting</div>
                  <div className="text-xs text-slate-500 font-normal">Meeting at office / branch</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('client_visit')}
                className={`p-3 rounded-lg border text-left flex items-center gap-3 transition ${
                  f.type === 'client_visit'
                    ? 'border-amber-600 bg-amber-50/80 text-amber-950 ring-2 ring-amber-500/20 font-semibold'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className={`p-2 rounded-md ${f.type === 'client_visit' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm">Client Visit / On-Site</div>
                  <div className="text-xs text-slate-500 font-normal">Travel to client location / site</div>
                </div>
              </button>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-title" className="text-xs font-semibold text-slate-700">Title / Subject *</Label>
            <Input
              id="appt-title"
              placeholder="e.g. Annual Tax Audit Discussion, GST Return Verification"
              value={f.title}
              onChange={e => setF({ ...f, title: e.target.value })}
              required
            />
          </div>

          {/* Client & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Linked Client (Optional)</Label>
              <Select value={f.clientId || 'none'} onValueChange={v => handleClientSelect(v === 'none' ? '' : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none">-- No Client / General --</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appt-location" className="text-xs font-semibold text-slate-700">
                {f.type === 'in_office' ? 'Room / Branch Name' : 'Client Address / Venue'}
              </Label>
              <Input
                id="appt-location"
                placeholder={f.type === 'in_office' ? 'e.g. Conference Room A, Cabin 3' : 'e.g. Plot 45, Industrial Estate, MIDC'}
                value={f.locationAddress}
                onChange={e => setF({ ...f, locationAddress: e.target.value })}
              />
            </div>
          </div>

          {/* Date, Start Time, End Time & Status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="appt-date" className="text-xs font-semibold text-slate-700">Date *</Label>
              <Input
                id="appt-date"
                type="date"
                value={f.date}
                onChange={e => setF({ ...f, date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appt-start" className="text-xs font-semibold text-slate-700">Start Time</Label>
              <Input
                id="appt-start"
                type="time"
                value={f.startTime}
                onChange={e => setF({ ...f, startTime: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appt-end" className="text-xs font-semibold text-slate-700">End Time</Label>
              <Input
                id="appt-end"
                type="time"
                value={f.endTime}
                onChange={e => setF({ ...f, endTime: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Status</Label>
              <Select value={f.status} onValueChange={v => setF({ ...f, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Rescheduled">Rescheduled</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignees (Multi-User Staff Assignment) */}
          <div className="space-y-2 p-3.5 rounded-lg border bg-slate-50/80">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-600" /> Assigned Staff / Team Members
                </Label>
                <p className="text-[11px] text-slate-500">
                  {currentUser.role === 'admin'
                    ? 'Admin Assignment: Select one or multiple team members for this appointment.'
                    : 'Assign yourself or team members attending this appointment.'}
                </p>
              </div>

              <div className="flex gap-2 text-xs">
                <button type="button" onClick={selectSelfOnly} className="text-indigo-600 hover:underline">Myself only</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={selectAllUsers} className="text-indigo-600 hover:underline">Select all</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-40 overflow-y-auto">
              {users.map(u => {
                const isAssigned = (f.assignedUserIds || []).includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUserAssign(u.id)}
                    className={`p-2 rounded-md border text-left text-xs flex items-center justify-between transition ${
                      isAssigned
                        ? 'bg-indigo-100/70 border-indigo-300 text-indigo-900 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                        isAssigned ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white'
                      }`}>
                        {isAssigned && '✓'}
                      </div>
                      <span className="truncate">{u.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 capitalize">{u.role}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agenda / Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-notes" className="text-xs font-semibold text-slate-700">Agenda / Notes</Label>
            <Textarea
              id="appt-notes"
              placeholder="Meeting discussion points, documents required, key outcomes..."
              rows={3}
              value={f.notes}
              onChange={e => setF({ ...f, notes: e.target.value })}
            />
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {saving ? 'Saving...' : f.id ? 'Update Appointment' : 'Schedule Appointment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


export default App;
