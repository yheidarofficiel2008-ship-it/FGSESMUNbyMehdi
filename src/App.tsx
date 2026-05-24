import React, { useState, useEffect, ReactNode, FormEvent } from "react";
import { 
  LogOut, 
  LogIn,
  Loader2, 
  LayoutDashboard,
  Users,
  Settings,
  Database,
  Search,
  Menu,
  X,
  User as UserIcon,
  Mail,
  Lock,
  ArrowRight,
  Plus,
  AlertCircle,
  CheckCircle2,
  Home,
  Calendar,
  CalendarDays,
  Pin,
  Mic2,
  Info,
  ChevronRight,
  ChevronLeft,
  Globe,
  Heart,
  Trash2,
  FileSpreadsheet,
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Paperclip,
  Star,
  Archive,
  Download,
  AlertTriangle,
  Sparkles,
  Upload,
  Activity,
  FileText,
  Target,
  Briefcase
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar, 
  Cell,
  ReferenceLine
} from "recharts";
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  getDocFromServer,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  deleteDoc,
  updateDoc
} from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { getApps, initializeApp as initSecondaryApp } from "firebase/app";
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword as createSecondaryUser, signOut as signOutSecondary } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In production, we log, but we don't always want to throw as it can crash React's render/effect cycle
}

// Types for campaign data
interface ProgramSection {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  order: number;
}

interface Conference {
  id: string;
  title: string;
  description: string;
  logoUrl: string;
  order: number;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  description?: string;
  photoUrl: string;
  contact: string;
  order: number;
}

interface HomepageBlock {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  signature?: string;
  order: number;
  createdAt: any;
}

function ExpandableText({ text, limit = 150, className = "" }: { text: string; limit?: number; className?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = text.length > limit;

  if (!shouldTruncate) return <p className={className}>{text}</p>;

  return (
    <div className={className}>
      <p className="inline">
        {isExpanded ? text : `${text.substring(0, limit)}... `}
      </p>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="text-primary font-bold hover:underline ml-1 inline-block"
      >
        {isExpanded ? "Voir moins" : "Lire plus"}
      </button>
    </div>
  );
}

const getLocalDateTimeString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
};

const formatTransactionDate = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("T");
    const datePart = parts[0]; // YYYY-MM-DD
    const ymd = datePart.split("-");
    if (ymd.length === 3) {
      const frenchDate = `${ymd[2]}/${ymd[1]}/${ymd[0]}`;
      if (parts[1]) {
        return `${frenchDate} à ${parts[1]}`;
      }
      return frenchDate;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dbStatus, setDbStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [activeTab, setActiveTab] = useState("home");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<HomepageBlock | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Data State
  const [program, setProgram] = useState<ProgramSection[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [homepageBlocks, setHomepageBlocks] = useState<HomepageBlock[]>([]);
  
  // Supporters State
  const [supportersList, setSupportersList] = useState<any[]>([]);
  const [showSupporterModal, setShowSupporterModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(() => {
    try {
      return !sessionStorage.getItem("fgsesmun_welcome_promo_dismissed2");
    } catch {
      return true;
    }
  });
  const [supporterForm, setSupporterForm] = useState({
    fullName: "",
    academicLevel: "",
    fieldOfStudy: "",
    phone: "",
    email: ""
  });
  const [supporterSubmitting, setSupporterSubmitting] = useState(false);
  const [supporterSuccess, setSupporterSuccess] = useState(false);
  
  // Admin Form State
  const [showAddForm, setShowAddForm] = useState<"none" | "program" | "conference" | "team" | "homepage">("none");
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  
  // Treasury State
  const [financeTransactions, setFinanceTransactions] = useState<any[]>([]);
  const [financeGoals, setFinanceGoals] = useState<any[]>([]);
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [showEditGoalModal, setShowEditGoalModal] = useState<any>(null);
  const [deleteConfirmGoalId, setDeleteConfirmGoalId] = useState<string | null>(null);
  const [calendarYear, setCalendarYear] = useState<number>(2026);
  const [calendarMonth, setCalendarMonth] = useState<number>(4); // 0-indexed, 4 = Mai
  
  // Agenda State
  const [agendaEvents, setAgendaEvents] = useState<any[]>([]);
  const [agendaNotes, setAgendaNotes] = useState<any[]>([]);
  const [agendaYear, setAgendaYear] = useState<number>(2026);
  const [agendaMonth, setAgendaMonth] = useState<number>(4); // Default to Mai (4)
  const [showAddEventModalDate, setShowAddEventModalDate] = useState<string | null>(null);
  const [showEventDetails, setShowEventDetails] = useState<any>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState(false);

  // Reset modal states on change
  useEffect(() => {
    setIsEditingEvent(false);
    setDeleteConfirmEvent(false);
  }, [showEventDetails]);
  const [eventForm, setEventForm] = useState({
    title: "",
    category: "Réunion", // Réunion, Conférence, Événement, Visite, Autre
    importance: "Moyenne", // Haute, Moyenne, Basse
    description: ""
  });
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteColor, setNewNoteColor] = useState("yellow"); // yellow, blue, green, pink
  
  const [goalForm, setGoalForm] = useState({
    title: "",
    amount: "",
    description: ""
  });
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [incomeForm, setIncomeForm] = useState({
    amount: "",
    source: "",
    category: "Sponsoring",
    description: "",
    date: getLocalDateTimeString(),
    attachmentUrl: ""
  });
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    description: "",
    category: "Événement",
    responsible: "",
    date: getLocalDateTimeString(),
    attachmentUrl: "",
    priority: "Moyenne"
  });
  const [financeSubmitting, setFinanceSubmitting] = useState(false);
  const [financeSubTab, setFinanceSubTab] = useState<'overview' | 'ledger' | 'analytics' | 'docs' | 'goals'>('overview');
  const [financeSearch, setFinanceSearch] = useState("");
  const [financeTypeFilter, setFinanceTypeFilter] = useState("all");
  const [financeCatFilter, setFinanceCatFilter] = useState("all");
  const [financeSortBy, setFinanceSortBy] = useState("newest");
  
  // Internal notes state and notifications
  const [internalNotes, setInternalNotes] = useState(() => {
    try {
      return localStorage.getItem("fgsesmun_finance_notes") || "";
    } catch {
      return "";
    }
  });
  
  // Auth Form State
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Access and Accounts Management state
  const [userProfile, setUserProfile] = useState<any>(null);
  const [newUserPrefix, setNewUserPrefix] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [isCreatingUserLoading, setIsCreatingUserLoading] = useState(false);
  const [newUserPerms, setNewUserPerms] = useState({
    canModifyHome: false,
    canModifyProgramme: false,
    canModifyConferences: false,
    canModifyEquipe: false,
    canViewSoutiens: false,
    canModifySoutiens: false,
    canViewTresorerie: false,
    canModifyTresorerie: false,
    canViewAgenda: false,
    canModifyAgenda: false,
    canViewAccounts: false,
    canModifyAccounts: false,
  });

  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [userProfileSearch, setUserProfileSearch] = useState("");
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<any | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<any>({});
  const [isUpdatingUserPermissions, setIsUpdatingUserPermissions] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [isDeletingTeammate, setIsDeletingTeammate] = useState(false);

  // Teammate direct creation states
  const [newTeammateEmail, setNewTeammateEmail] = useState("");
  const [newTeammateName, setNewTeammateName] = useState("");
  const [newTeammatePassword, setNewTeammatePassword] = useState("");
  const [newTeammateRole, setNewTeammateRole] = useState("user");
  const [newTeammatePermissions, setNewTeammatePermissions] = useState({
    canModifyHome: true,
    canModifyProgramme: true,
    canModifyConferences: true,
    canModifyEquipe: true,
    canViewSoutiens: true,
    canModifySoutiens: true,
    canViewTresorerie: true,
    canModifyTresorerie: true,
    canViewAgenda: true,
    canModifyAgenda: true,
    canViewAccounts: true,
    canModifyAccounts: true,
  });
  const [isCreatingTeammate, setIsCreatingTeammate] = useState(false);
  const [creationError, setCreationError] = useState("");
  const [creationSuccess, setCreationSuccess] = useState("");

  const checkPermission = (perm: string): boolean => {
    if (!user) return false;
    if (user.email === "admin@fgses.mun") return true; // Sovereign bypass
    if (!userProfile) return false;
    return !!userProfile[perm];
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          await getDocFromServer(doc(db, "system", "health"));
          setDbStatus("connected");

          const userRef = doc(db, "users", firebaseUser.uid);
          unsubProfile = onSnapshot(userRef, async (snap) => {
            if (snap.exists()) {
              setUserProfile(snap.data());
            } else {
              const defaultProfile = {
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0],
                role: firebaseUser.email === "admin@fgses.mun" ? "admin" : "user",
                createdAt: serverTimestamp(),
                canModifyHome: firebaseUser.email === "admin@fgses.mun",
                canModifyProgramme: firebaseUser.email === "admin@fgses.mun",
                canModifyConferences: firebaseUser.email === "admin@fgses.mun",
                canModifyEquipe: firebaseUser.email === "admin@fgses.mun",
                canViewSoutiens: firebaseUser.email === "admin@fgses.mun",
                canModifySoutiens: firebaseUser.email === "admin@fgses.mun",
                canViewTresorerie: firebaseUser.email === "admin@fgses.mun",
                canModifyTresorerie: firebaseUser.email === "admin@fgses.mun",
                canViewAgenda: firebaseUser.email === "admin@fgses.mun",
                canModifyAgenda: firebaseUser.email === "admin@fgses.mun",
                canViewAccounts: firebaseUser.email === "admin@fgses.mun",
                canModifyAccounts: firebaseUser.email === "admin@fgses.mun",
              };
              await setDoc(userRef, defaultProfile);
              setUserProfile(defaultProfile);
            }
          });
        } catch (err) {
          console.error("Database status error:", err);
          setDbStatus("error");
        }
      } else {
        setUserProfile(null);
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        getDocFromServer(doc(db, "system", "health"))
          .then(() => setDbStatus("connected"))
          .catch(() => setDbStatus("error"));
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Fetch Campaign Data
  useEffect(() => {
    const qProgram = query(collection(db, "program"));
    const unsubProgram = onSnapshot(qProgram, (snapshot) => {
      const sections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProgramSection));
      setProgram(sections.sort((a, b) => (a.order || 0) - (b.order || 0)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "program"));

    const qConferences = query(collection(db, "conferences"));
    const unsubConferences = onSnapshot(qConferences, (snapshot) => {
      const confs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conference));
      setConferences(confs.sort((a, b) => (a.order || 0) - (b.order || 0)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "conferences"));

    const qTeam = query(collection(db, "team"));
    const unsubTeam = onSnapshot(qTeam, (snapshot) => {
      const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeamMember));
      setTeam(members.sort((a, b) => (a.order || 0) - (b.order || 0)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "team"));

    const qHome = query(collection(db, "homepageBlocks")); // No strict orderBy to avoid documents with missing fields disappearing
    const unsubHome = onSnapshot(qHome, (snapshot) => {
      const blocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HomepageBlock));
      // Sort manually to be resilient to missing 'order' field
      setHomepageBlocks(blocks.sort((a, b) => (a.order || 0) - (b.order || 0)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "homepageBlocks"));

    return () => {
      unsubProgram();
      unsubConferences();
      unsubTeam();
      unsubHome();
    };
  }, []);

  // Fetch Supporters list (Admin only)
  useEffect(() => {
    if (!user) {
      setSupportersList([]);
      return;
    }

    const qSupporters = query(collection(db, "supporters"));
    const unsubSupporters = onSnapshot(qSupporters, (snapshot) => {
      const sups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSupportersList(sups.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "supporters"));

    return () => unsubSupporters();
  }, [user]);

  // Fetch Finance transactions (Admin only)
  useEffect(() => {
    if (!user) {
      setFinanceTransactions([]);
      return;
    }

    const qFinance = query(collection(db, "financeTransactions"));
    const unsubFinance = onSnapshot(qFinance, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFinanceTransactions(items.sort((a: any, b: any) => {
        const strA = a.date ? (a.date.includes("T") ? a.date : `${a.date}T00:00`) : "1970-01-01T00:00";
        const strB = b.date ? (b.date.includes("T") ? b.date : `${b.date}T00:00`) : "1970-01-01T00:00";
        const dateA = new Date(strA).getTime();
        const dateB = new Date(strB).getTime();
        if (dateB !== dateA) return dateB - dateA;
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "financeTransactions"));

    return () => unsubFinance();
  }, [user]);

  // Fetch Finance goals (Admin only)
  useEffect(() => {
    if (!user) {
      setFinanceGoals([]);
      return;
    }

    const qGoals = query(collection(db, "financeGoals"));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFinanceGoals(items.sort((a: any, b: any) => {
        const orderA = typeof a.order === 'number' ? a.order : 0;
        const orderB = typeof b.order === 'number' ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeA - timeB;
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "financeGoals"));

    return () => unsubGoals();
  }, [user]);

  // Fetch Agenda Events (Admin only)
  useEffect(() => {
    if (!user) {
      setAgendaEvents([]);
      return;
    }

    const qEvents = query(collection(db, "agendaEvents"));
    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAgendaEvents(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "agendaEvents"));

    return () => unsubEvents();
  }, [user]);

  // Fetch Agenda Notes (Admin only)
  useEffect(() => {
    if (!user) {
      setAgendaNotes([]);
      return;
    }

    const qNotes = query(collection(db, "agendaNotes"));
    const unsubNotes = onSnapshot(qNotes, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAgendaNotes(items.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "agendaNotes"));

    return () => unsubNotes();
  }, [user]);

  // Fetch System Users (Admin only)
  useEffect(() => {
    if (!user || !checkPermission("canViewAccounts")) {
      setSystemUsers([]);
      return;
    }

    const qUsers = query(collection(db, "users"));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSystemUsers(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "users"));

    return () => unsubUsers();
  }, [user, userProfile]);

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormLoading(true);

    try {
      const collectionMap: any = {
        program: "program",
        conference: "conferences",
        team: "team",
        homepage: "homepageBlocks"
      };

      const orderMap: any = {
        program: program.length + 1,
        conference: conferences.length + 1,
        team: team.length + 1,
        homepage: homepageBlocks.length + 1
      };

      const payload = {
        ...formData,
        createdAt: serverTimestamp(),
        order: orderMap[showAddForm]
      };

      await addDoc(collection(db, collectionMap[showAddForm]), payload);
      setShowAddForm("none");
      setFormData({});
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, showAddForm);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteItem = async (col: string, id: string) => {
    if (!user) return;
    
    // Check collection permissions before deleting
    if (col === "supporters" && !checkPermission("canModifySoutiens")) return;
    if ((col === "financeTransactions" || col === "financeGoals") && !checkPermission("canModifyTresorerie")) return;
    if (col === "homeBlocks" && !checkPermission("canModifyHome")) return;
    if (col === "programmeSections" && !checkPermission("canModifyProgramme")) return;
    if (col === "conferences" && !checkPermission("canModifyConferences")) return;
    if (col === "teamMembers" && !checkPermission("canModifyEquipe")) return;
    if (col === "agendaEvents" && !checkPermission("canModifyAgenda")) return;

    try {
      await deleteDoc(doc(db, col, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${col}/${id}`);
    }
  };

  const handleMoveItem = async (col: string, items: any[], id: string, direction: 'up' | 'down') => {
    if (!user) return;
    
    // Check collection permissions before reordering
    if (col === "supporters" && !checkPermission("canModifySoutiens")) return;
    if ((col === "financeTransactions" || col === "financeGoals") && !checkPermission("canModifyTresorerie")) return;
    if (col === "homeBlocks" && !checkPermission("canModifyHome")) return;
    if (col === "programmeSections" && !checkPermission("canModifyProgramme")) return;
    if (col === "conferences" && !checkPermission("canModifyConferences")) return;
    if (col === "teamMembers" && !checkPermission("canModifyEquipe")) return;
    if (col === "agendaEvents" && !checkPermission("canModifyAgenda")) return;

    const index = items.findIndex(m => m.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const neighborIndex = direction === 'up' ? index - 1 : index + 1;
    const current = { ...items[index], order: items[index].order ?? index };
    const neighbor = { ...items[neighborIndex], order: items[neighborIndex].order ?? neighborIndex };

    let newCurrentOrder = neighbor.order;
    let newNeighborOrder = current.order;
    
    if (newCurrentOrder === newNeighborOrder) {
      newCurrentOrder = direction === 'up' ? newCurrentOrder - 1 : newCurrentOrder + 1;
    }

    try {
      await updateDoc(doc(db, col, current.id), { order: newCurrentOrder });
      await updateDoc(doc(db, col, neighbor.id), { order: newNeighborOrder });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${col}/${current.id}`);
    }
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setShowAuthModal(false);
    } catch (err: any) {
      console.error("Auth error:", err);
      let message = "Une erreur est survenue.";
      if (err.code === "auth/invalid-credential") message = "Identifiants invalides.";
      if (err.code === "auth/user-not-found") message = "Utilisateur non trouvé.";
      if (err.code === "auth/wrong-password") message = "Mot de passe incorrect.";
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleSaveSupporter = async (e: FormEvent) => {
    e.preventDefault();
    setSupporterSubmitting(true);
    try {
      const payload = {
        fullName: supporterForm.fullName.trim(),
        academicLevel: supporterForm.academicLevel,
        fieldOfStudy: supporterForm.fieldOfStudy,
        phone: supporterForm.phone.trim(),
        email: supporterForm.email.trim(),
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, "supporters"), payload);
      setSupporterSuccess(true);
      setSupporterForm({
        fullName: "",
        academicLevel: "",
        fieldOfStudy: "",
        phone: "",
        email: ""
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "supporters");
    } finally {
      setSupporterSubmitting(false);
    }
  };

  const exportSupporterToCSV = () => {
    const BOM = "\uFEFF";
    const headers = ["Nom complet", "Niveau universitaire", "Filière", "Numéro", "Email", "Date d'inscription"];
    
    const rows = supportersList.map(sup => [
      sup.fullName || "",
      sup.academicLevel || "",
      sup.fieldOfStudy || "",
      sup.phone || "",
      sup.email || "",
      sup.createdAt ? new Date(sup.createdAt.seconds * 1000).toLocaleString("fr-FR") : ""
    ]);

    const csvContent = BOM + [headers.join(";"), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `soutiens_fgsesmun_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveIncome = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPermission("canModifyTresorerie")) return;
    const amt = parseFloat(incomeForm.amount) || 0;
    if (amt <= 0) {
      return;
    }
    setFinanceSubmitting(true);
    try {
      const payload = {
        type: "in",
        amount: amt,
        category: incomeForm.category,
        description: incomeForm.description.trim(),
        responsible: incomeForm.source.trim(),
        date: incomeForm.date,
        attachmentUrl: incomeForm.attachmentUrl.trim(),
        archived: false,
        favorite: false,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "financeTransactions"), payload);
      setShowAddIncomeModal(false);
      setIncomeForm({
        amount: "",
        source: "",
        category: "Sponsoring",
        description: "",
        date: getLocalDateTimeString(),
        attachmentUrl: ""
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "financeTransactions");
    } finally {
      setFinanceSubmitting(false);
    }
  };

  const handleSaveExpense = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPermission("canModifyTresorerie")) return;
    const amt = parseFloat(expenseForm.amount) || 0;
    if (amt <= 0) {
      return;
    }
    setFinanceSubmitting(true);
    try {
      const payload = {
        type: "out",
        amount: amt,
        description: expenseForm.description.trim(),
        category: expenseForm.category,
        responsible: expenseForm.responsible.trim(),
        date: expenseForm.date,
        attachmentUrl: expenseForm.attachmentUrl.trim(),
        priority: expenseForm.priority,
        archived: false,
        favorite: false,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "financeTransactions"), payload);
      setShowAddExpenseModal(false);
      setExpenseForm({
        amount: "",
        description: "",
        category: "Événement",
        responsible: "",
        date: getLocalDateTimeString(),
        attachmentUrl: "",
        priority: "Moyenne"
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "financeTransactions");
    } finally {
      setFinanceSubmitting(false);
    }
  };

  const exportFinanceToCSV = () => {
    const BOM = "\uFEFF";
    const headers = ["Type", "Montant (DH)", "Catégorie", "Motif / Description", "Responsable / Source", "Date transaction", "Priorité", "Statut", "Pièce jointe / Facture"];
    
    const rows = financeTransactions.map(t => [
      t.type === "in" ? "Entrée" : "Sortie",
      t.amount || 0,
      t.category || "",
      t.description || "",
      t.responsible || "",
      t.date || "",
      t.type === "out" ? (t.priority || "Moyenne") : "-",
      t.archived ? "Archivé" : "Actif",
      t.attachmentUrl || ""
    ]);

    const csvContent = BOM + [headers.join(";"), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `compta_fgsesmun_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleTransactionFavorite = async (id: string, current: boolean) => {
    if (!checkPermission("canModifyTresorerie")) return;
    try {
      await updateDoc(doc(db, "financeTransactions", id), { favorite: !current });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `financeTransactions/${id}`);
    }
  };

  const toggleTransactionArchived = async (id: string, current: boolean) => {
    if (!checkPermission("canModifyTresorerie")) return;
    try {
      await updateDoc(doc(db, "financeTransactions", id), { archived: !current });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `financeTransactions/${id}`);
    }
  };

  const handleSaveGoal = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPermission("canModifyTresorerie")) return;
    const amountNum = parseFloat(goalForm.amount) || 0;
    if (amountNum <= 0) return;
    try {
      await addDoc(collection(db, "financeGoals"), {
        title: goalForm.title.trim(),
        amount: amountNum,
        description: goalForm.description.trim(),
        createdAt: serverTimestamp(),
        order: financeGoals.length > 0 ? Math.max(...financeGoals.map(g => g.order ?? 0)) + 1 : 0
      });
      setShowAddGoalModal(false);
      setGoalForm({ title: "", amount: "", description: "" });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "financeGoals");
    }
  };

  const handleUpdateGoal = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPermission("canModifyTresorerie") || !showEditGoalModal) return;
    const amountNum = parseFloat(goalForm.amount) || 0;
    if (amountNum <= 0) return;
    try {
      await updateDoc(doc(db, "financeGoals", showEditGoalModal.id), {
        title: goalForm.title.trim(),
        amount: amountNum,
        description: goalForm.description.trim()
      });
      setShowEditGoalModal(null);
      setGoalForm({ title: "", amount: "", description: "" });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "financeGoals");
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!checkPermission("canModifyTresorerie")) return;
    try {
      await deleteDoc(doc(db, "financeGoals", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `financeGoals/${id}`);
    }
  };

  // Agenda CRUD Handlers
  const handleAddAgendaEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPermission("canModifyAgenda") || !showAddEventModalDate) return;
    try {
      await addDoc(collection(db, "agendaEvents"), {
        title: eventForm.title.trim() || "Sans titre",
        category: eventForm.category,
        importance: eventForm.importance,
        description: eventForm.description.trim(),
        date: showAddEventModalDate, // preselected string "YYYY-MM-DD"
        createdAt: serverTimestamp()
      });
      setShowAddEventModalDate(null);
      setEventForm({
        title: "",
        category: "Réunion",
        importance: "Moyenne",
        description: ""
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "agendaEvents");
    }
  };

  const handleDeleteAgendaEvent = async (id: string) => {
    if (!checkPermission("canModifyAgenda")) return;
    try {
      await deleteDoc(doc(db, "agendaEvents", id));
      setShowEventDetails(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `agendaEvents/${id}`);
    }
  };

  const handleUpdateAgendaEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPermission("canModifyAgenda") || !showEventDetails) return;
    try {
      await updateDoc(doc(db, "agendaEvents", showEventDetails.id), {
        title: eventForm.title.trim() || "Sans titre",
        category: eventForm.category,
        importance: eventForm.importance,
        description: eventForm.description.trim()
      });
      setShowEventDetails(null);
      setEventForm({
        title: "",
        category: "Réunion",
        importance: "Moyenne",
        description: ""
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `agendaEvents/${showEventDetails.id}`);
    }
  };

  const handleAddAgendaNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPermission("canModifyAgenda") || !newNoteText.trim()) return;
    try {
      await addDoc(collection(db, "agendaNotes"), {
        text: newNoteText.trim(),
        color: newNoteColor,
        createdAt: serverTimestamp(),
        dateStr: new Date().toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      });
      setNewNoteText("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "agendaNotes");
    }
  };

  const handleDeleteAgendaNote = async (id: string) => {
    if (!checkPermission("canModifyAgenda")) return;
    try {
      await deleteDoc(doc(db, "agendaNotes", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `agendaNotes/${id}`);
    }
  };

  const handleUpdateInternalNotes = (text: string) => {
    setInternalNotes(text);
    try {
      localStorage.setItem("fgsesmun_finance_notes", text);
    } catch (err) {
      console.error(err);
    }
  };

  // System Teammate Access CRUD Handlers
  const handleUpdateTeammatePermissions = async (userId: string, updatedPerms: any, updatedDisplayName?: string, updatedRole?: string) => {
    if (!checkPermission("canModifyAccounts")) return;
    setIsUpdatingUserPermissions(true);
    try {
      await updateDoc(doc(db, "users", userId), {
        ...updatedPerms,
        ...(updatedDisplayName ? { displayName: updatedDisplayName.trim() } : {}),
        ...(updatedRole ? { role: updatedRole } : {}),
      });
      setSelectedUserForEdit(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
    } finally {
      setIsUpdatingUserPermissions(false);
    }
  };

  const handleDeleteTeammate = async (userId: string) => {
    if (!checkPermission("canModifyAccounts")) return;
    if (userId === user?.uid) {
      return;
    }
    setIsDeletingTeammate(true);
    try {
      await deleteDoc(doc(db, "users", userId));
      setUserToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}`);
    } finally {
      setIsDeletingTeammate(false);
    }
  };

  const handleCreateTeammateAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPermission("canModifyAccounts")) return;
    setCreationError("");
    setCreationSuccess("");

    const email = newTeammateEmail.trim();
    const displayName = newTeammateName.trim();
    const password = newTeammatePassword;

    if (!email || !displayName || !password) {
      setCreationError("Veuillez remplir tous les champs requis.");
      return;
    }

    if (password.length < 6) {
      setCreationError("Le mot de passe doit comporter au moins 6 caractères.");
      return;
    }

    setIsCreatingTeammate(true);
    try {
      const apps = getApps();
      const secondaryAppName = "TeammateCreatorApp";
      let secondaryApp = apps.find(app => app.name === secondaryAppName);
      if (!secondaryApp) {
        secondaryApp = initSecondaryApp(firebaseConfig, secondaryAppName);
      }
      const secondaryAuth = getSecondaryAuth(secondaryApp);
      
      // Create user holding the secondary app auth state safely
      const userCredential = await createSecondaryUser(secondaryAuth, email, password);
      const newUid = userCredential.user.uid;

      // Set preconfigured access controls in Firestore for the newly created user
      await setDoc(doc(db, "users", newUid), {
        email,
        displayName,
        role: newTeammateRole,
        createdAt: serverTimestamp(),
        ...newTeammatePermissions,
      });

      // Clear the secondary user authentication session
      await signOutSecondary(secondaryAuth);

      // Reset Form fields
      setNewTeammateEmail("");
      setNewTeammateName("");
      setNewTeammatePassword("");
      setNewTeammateRole("user");
      setNewTeammatePermissions({
        canModifyHome: true,
        canModifyProgramme: true,
        canModifyConferences: true,
        canModifyEquipe: true,
        canViewSoutiens: true,
        canModifySoutiens: true,
        canViewTresorerie: true,
        canModifyTresorerie: true,
        canViewAgenda: true,
        canModifyAgenda: true,
        canViewAccounts: true,
        canModifyAccounts: true,
      });

      setCreationSuccess(`Comte créé de manière instantanée pour ${displayName} !`);
    } catch (err: any) {
      console.error("Error creating teammate:", err);
      let errorMsg = "Impossible de créer le compte de collaborateur.";
      if (err.code === "auth/email-already-in-use") {
        errorMsg = "Cette adresse e-mail est déjà associée à un compte.";
      } else if (err.code === "auth/invalid-email") {
        errorMsg = "L'adresse e-mail saisie n'est pas valide.";
      } else if (err.code === "auth/weak-password") {
        errorMsg = "Le mot de passe choisi est trop faible (6 caractères minimum).";
      } else if (err.message) {
        errorMsg = err.message;
      }
      setCreationError(errorMsg);
    } finally {
      setIsCreatingTeammate(false);
    }
  };

  // Active tab fallback safety check
  useEffect(() => {
    if (activeTab === "supporters" && !checkPermission("canViewSoutiens")) setActiveTab("home");
    if (activeTab === "tresorerie" && !checkPermission("canViewTresorerie")) setActiveTab("home");
    if (activeTab === "agenda" && !checkPermission("canViewAgenda")) setActiveTab("home");
    if (activeTab === "accounts" && !checkPermission("canViewAccounts")) setActiveTab("home");
  }, [userProfile, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Chargement du système...</p>
        </div>
      </div>
    );
  }

  const logoUrl = "https://lh3.googleusercontent.com/d/1zTWE8tcdG-uLAOgMfpgwpjaDZnmmyK5A";

  const tabs = [
    { id: "home", label: "Accueil", icon: <Home size={22} /> },
    { id: "programme", label: "Programme", icon: <Calendar size={22} /> },
    { id: "conferences", label: "Nos Conférences", icon: <Mic2 size={22} /> },
    { id: "equipe", label: "Équipe", icon: <Users size={22} /> },
  ];

  const activeTabs = [
    ...tabs,
    ...(user ? [
      ...(checkPermission("canViewSoutiens") ? [{ id: "supporters", label: "Soutiens", icon: <Heart size={22} /> }] : []),
      ...(checkPermission("canViewTresorerie") ? [{ id: "tresorerie", label: "Trésorerie", icon: <Wallet size={22} /> }] : []),
      ...(checkPermission("canViewAgenda") ? [{ id: "agenda", label: "Agenda", icon: <CalendarDays size={22} /> }] : []),
      ...(checkPermission("canViewAccounts") ? [{ id: "accounts", label: "Gestion de compte", icon: <Settings size={22} /> }] : [])
    ] : [])
  ];

  return (
    <div className="h-screen bg-[#FDFDFD] text-zinc-900 font-sans flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-16 border-b border-zinc-100 bg-white flex items-center px-4 md:px-6 z-[60] gap-4 shrink-0">
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-zinc-50 rounded-lg transition-colors"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab("home")}>
          <img 
            ref={(el) => { if (el) el.referrerPolicy = "no-referrer"; }}
            src={logoUrl} 
            alt="Logo" 
            className="h-10 w-auto object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const fallback = document.createElement('div');
                fallback.className = 'font-black tracking-tighter text-xl text-primary';
                fallback.innerText = 'FGSESMUN';
                parent.appendChild(fallback);
                parent.style.display = 'block';
              }
            }}
          />
        </div>

        {/* Public Soutien Button always visible at the right */}
        <div className="ml-auto">
          <button 
            onClick={() => {
              setSupporterSuccess(false);
              setShowSupporterModal(true);
            }}
            className="px-4 py-2 bg-primary hover:bg-opacity-90 text-white text-[11px] font-bold uppercase tracking-widest rounded-full transition-all flex items-center gap-1.5 shadow-sm hover:scale-105"
          >
            <Heart size={14} className="fill-current text-white" />
            <span>Je soutiens</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside 
          className={`
            fixed md:relative inset-y-0 left-0 bg-white border-r border-zinc-100 z-[80] md:z-40
            transition-all duration-300 ease-in-out flex flex-col h-full
            ${sidebarOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full md:translate-x-0 md:w-16"}
          `}
        >
          {/* Mobile Overlay */}
          {sidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[-1] md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Mobile Close Button inside sidebar */}
          {sidebarOpen && (
            <button 
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-900 md:hidden"
            >
              <X size={20} />
            </button>
          )}

          <div className="flex flex-col h-full py-6">
            <nav className="flex-1 px-4 space-y-1">
              {activeTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-4 px-3 py-3 rounded-lg transition-all
                    ${activeTab === tab.id 
                      ? "bg-primary text-white shadow-md shadow-zinc-200" 
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}
                    ${!sidebarOpen && "md:justify-center md:px-0"}
                  `}
                >
                  <span className={`${activeTab === tab.id ? "text-white" : "text-zinc-500"}`}>
                    {tab.icon}
                  </span>
                  {sidebarOpen && (
                    <span className="text-[12px] font-bold uppercase tracking-wider overflow-hidden whitespace-nowrap">
                      {tab.label}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            
            <div className="px-4 mt-auto">
              <div className="h-px bg-zinc-100 mb-6" />
              
              {user ? (
                <div className={`flex items-center gap-3 ${sidebarOpen ? "flex-row" : "flex-col"}`}>
                  <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center border border-zinc-200 overflow-hidden shrink-0">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-primary">{user.email?.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  {sidebarOpen && (
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold leading-tight truncate">{user.displayName || user.email}</p>
                      <p className="text-[9px] text-zinc-400 uppercase tracking-widest">Connecté</p>
                    </div>
                  )}
                  <button 
                    onClick={handleLogout}
                    className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center border border-zinc-200 hover:bg-zinc-200 transition-colors"
                    title="Déconnexion"
                  >
                    <LogOut size={16} className="text-zinc-600" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    setAuthMode("login");
                    setShowAuthModal(true);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-opacity-90 transition-all shadow-sm w-full ${!sidebarOpen && "justify-center px-0"}`}
                >
                  <LogIn size={!sidebarOpen ? 18 : 14} />
                  {sidebarOpen && <span>Connexion</span>}
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-zinc-50/10">
          <div className="container mx-auto px-4 md:px-8 py-10 md:py-16 max-w-6xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="space-y-16"
              >
                {activeTab === "home" && (
                  <div className="space-y-16 flex flex-col items-center text-center">
                    <header className="max-w-4xl space-y-10">
                      <div className="inline-block px-5 py-2 bg-primary text-white rounded-full mx-auto">
                        <span className="text-[11px] font-bold uppercase tracking-[0.25em]">
                          Campagne FGSES MUN 2026
                        </span>
                      </div>
                      <div className="space-y-4">
                        <h1 className="text-6xl md:text-9xl font-black tracking-tighter leading-[0.8] text-primary">
                          FGSES<span className="text-zinc-900">MUN</span><br/>
                          <span className="font-serif italic font-light text-zinc-400 text-[0.8em]">by Mehdi</span>
                        </h1>
                        <p className="text-lg md:text-3xl text-zinc-600 leading-relaxed font-serif italic max-w-3xl mx-auto">
                          Découvrez les dernières actualités et réflexions de notre équipe de campagne.
                        </p>
                      </div>
                      
                      {checkPermission("canModifyHome") && (
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-2">
                          <button 
                            onClick={() => {
                              setFormData({});
                              setShowAddForm("homepage");
                            }}
                            className="px-8 py-4 bg-zinc-950 text-white text-[12px] font-bold uppercase tracking-[0.15em] rounded-full hover:bg-opacity-90 transition-all flex items-center gap-2"
                          >
                            <Plus size={16} /> Nouvel Article
                          </button>
                        </div>
                      )}
                    </header>

                    <div className="w-24 h-1 bg-primary/10 mx-auto rounded-full" />

                    <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 pb-32">
                      {homepageBlocks.length === 0 ? (
                        <div className="col-span-full py-20 text-center">
                          <p className="text-zinc-400 font-serif italic text-lg">Aucun article publié pour le moment...</p>
                        </div>
                      ) : (
                        homepageBlocks.map((block, idx) => (
                          <motion.div 
                            key={block.id} 
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            onClick={() => setSelectedBlock(block)}
                            className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-500 cursor-pointer group flex flex-col h-full"
                          >
                            {block.imageUrl && (
                              <div className="h-64 overflow-hidden relative">
                                <img 
                                  src={block.imageUrl.includes('drive.google.com') ? `https://lh3.googleusercontent.com/d/${block.imageUrl.split('/d/')[1]?.split('/')[0]}` : block.imageUrl} 
                                  alt={block.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
                                  onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?q=80&w=1000"; }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            )}
                            <div className="p-8 flex flex-col flex-grow relative">
                              {checkPermission("canModifyHome") && (
                                <div className="absolute top-4 right-12 flex gap-2">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleMoveItem("homepageBlocks", homepageBlocks, block.id, 'up'); }}
                                    disabled={idx === 0}
                                    className="p-1 px-2 border border-zinc-100 rounded text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 flex items-center justify-center bg-white shadow-sm"
                                  >
                                    ↑
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleMoveItem("homepageBlocks", homepageBlocks, block.id, 'down'); }}
                                    disabled={idx === homepageBlocks.length - 1}
                                    className="p-1 px-2 border border-zinc-100 rounded text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 flex items-center justify-center bg-white shadow-sm"
                                  >
                                    ↓
                                  </button>
                                </div>
                              )}
                              <div className="flex justify-between items-start mb-4">
                                <h3 className="text-2xl font-bold text-primary tracking-tight leading-tight group-hover:text-zinc-900 transition-colors">
                                  {block.title}
                                </h3>
                                {checkPermission("canModifyHome") && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteItem("homepageBlocks", block.id);
                                    }}
                                    className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors"
                                  >
                                    <X size={16} />
                                  </button>
                                )}
                              </div>
                              <ExpandableText 
                                text={block.description} 
                                limit={120} 
                                className="text-zinc-500 text-sm leading-relaxed font-serif italic mb-6"
                              />
                              <div className="mt-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary">
                                Lire la suite <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "programme" && (
                  <div className="space-y-16">
                    <header className="flex flex-col md:flex-row justify-between items-center md:items-end gap-6">
                      <div className="text-center md:text-left">
                        <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-300 block mb-4 italic">Vision & Actions // 2026</span>
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase text-primary">Le Programme</h2>
                      </div>
                      {checkPermission("canModifyProgramme") && (
                        <button 
                          onClick={() => {
                            setFormData({});
                            setShowAddForm("program");
                          }}
                          className="px-4 py-2 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2"
                        >
                          Ajouter une section
                        </button>
                      )}
                    </header>

                    <div className="space-y-12">
                      {program.length === 0 ? (
                        <p className="text-zinc-400 font-serif italic text-lg text-center py-20">Le programme sera dévoilé prochainement...</p>
                      ) : (
                        program.map((section, idx) => (
                          <div key={section.id} className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 group bg-white p-6 md:p-10 rounded-2xl border border-zinc-100 hover:border-primary/20 transition-all duration-500 shadow-sm">
                            {section.imageUrl && (
                              <div className="md:col-span-4 h-64 bg-zinc-50 rounded-xl overflow-hidden border border-zinc-50">
                                <img 
                                  src={section.imageUrl.includes('drive.google.com') ? `https://lh3.googleusercontent.com/d/${section.imageUrl.split('/d/')[1]?.split('/')[0]}` : section.imageUrl} 
                                  alt={section.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                  onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?q=80&w=1000"; }}
                                />
                              </div>
                            )}
                            <div className={section.imageUrl ? "md:col-span-8" : "md:col-span-12"}>
                              <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-4">
                                  {checkPermission("canModifyProgramme") && (
                                    <div className="flex flex-col gap-1">
                                      <button 
                                        onClick={() => handleMoveItem("program", program, section.id, 'up')}
                                        disabled={idx === 0}
                                        className="p-1 border border-zinc-100 rounded hover:bg-zinc-50 disabled:opacity-30"
                                      >
                                        <ChevronRight className="rotate-[-90deg]" size={14} />
                                      </button>
                                      <button 
                                        onClick={() => handleMoveItem("program", program, section.id, 'down')}
                                        disabled={idx === program.length - 1}
                                        className="p-1 border border-zinc-100 rounded hover:bg-zinc-50 disabled:opacity-30"
                                      >
                                        <ChevronRight className="rotate-[90deg]" size={14} />
                                      </button>
                                    </div>
                                  )}
                                  <h3 className="text-3xl font-bold tracking-tight text-primary">{section.title}</h3>
                                </div>
                                {checkPermission("canModifyProgramme") && (
                                  <button onClick={() => handleDeleteItem("program", section.id)} className="p-2 text-zinc-300 hover:text-red-500 transition-colors">
                                    <X size={20} />
                                  </button>
                                )}
                              </div>
                              <ExpandableText 
                                text={section.description} 
                                limit={300} 
                                className="text-zinc-600 leading-relaxed font-serif text-lg whitespace-pre-wrap"
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "conferences" && (
                  <div className="space-y-16">
                    <header className="flex flex-col md:flex-row justify-between items-center md:items-end gap-6">
                      <div className="text-center md:text-left">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase text-primary">Nos Conférences</h2>
                      </div>
                      {checkPermission("canModifyConferences") && (
                        <button 
                          onClick={() => {
                            setFormData({});
                            setShowAddForm("conference");
                          }}
                          className="px-4 py-2 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-lg"
                        >
                          Nouvelle Conférence
                        </button>
                      )}
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {conferences.map((conf, idx) => (
                        <div key={conf.id} className="bg-white border border-zinc-100 p-6 md:p-10 flex flex-col items-center text-center group hover:border-primary transition-all duration-500 relative shadow-sm hover:shadow-lg rounded-2xl">
                          {checkPermission("canModifyConferences") && (
                            <div className="absolute top-6 left-6 flex gap-2">
                              <button 
                                onClick={() => handleMoveItem("conferences", conferences, conf.id, 'up')}
                                disabled={idx === 0}
                                className="p-1 px-2 border border-zinc-100 rounded text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 bg-white cursor-pointer"
                              >
                                ↑
                              </button>
                              <button 
                                onClick={() => handleMoveItem("conferences", conferences, conf.id, 'down')}
                                disabled={idx === conferences.length - 1}
                                className="p-1 px-2 border border-zinc-100 rounded text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 bg-white cursor-pointer"
                              >
                                ↓
                              </button>
                            </div>
                          )}
                          <div className="space-y-6 flex flex-col items-center">
                            <div className="w-32 h-32 bg-zinc-50 border-4 border-white shadow-xl rounded-full overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform duration-700">
                              <img 
                                src={conf.logoUrl.includes('drive.google.com') ? `https://lh3.googleusercontent.com/d/${conf.logoUrl.split('/d/')[1]?.split('/')[0]}` : conf.logoUrl} 
                                alt="Logo" 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1560179707-f14e90ef3623?q=80&w=1000"; }}
                              />
                            </div>
                            <h3 className="text-2xl font-bold tracking-tight text-primary transition-all group-hover:text-zinc-900">{conf.title}</h3>
                            <ExpandableText 
                              text={conf.description} 
                              limit={150} 
                              className="text-sm text-zinc-500 font-serif italic leading-relaxed"
                            />
                          </div>
                          {checkPermission("canModifyConferences") && (
                            <button onClick={() => handleDeleteItem("conferences", conf.id)} className="absolute top-6 right-6 text-zinc-300 hover:text-red-500 transition-colors cursor-pointer">
                              <X size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "equipe" && (
                  <div className="space-y-16">
                    <header className="flex flex-col md:flex-row justify-between items-center md:items-end gap-6 text-center md:text-left">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-300 block mb-4 italic">Mehdi_Team // 2026</span>
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase text-primary">Notre Équipe</h2>
                      </div>
                      {checkPermission("canModifyEquipe") && (
                        <button 
                          onClick={() => {
                            setFormData({});
                            setShowAddForm("team");
                          }}
                          className="px-4 py-2 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-lg cursor-pointer"
                        >
                          Ajouter un membre
                        </button>
                      )}
                    </header>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                      {team.map((member, idx) => (
                        <div key={member.id} className="bg-white p-6 md:p-10 border border-zinc-100 hover:border-primary/30 transition-all duration-500 group relative text-center rounded-3xl shadow-sm">
                          {checkPermission("canModifyEquipe") && (
                            <div className="absolute top-6 left-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleMoveItem("team", team, member.id, 'up')}
                                disabled={idx === 0}
                                className="p-2 border border-zinc-100 rounded-full text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 flex items-center justify-center bg-white shadow-sm cursor-pointer"
                              >
                                <ChevronRight className="rotate-[-90deg]" size={12} />
                              </button>
                              <button 
                                onClick={() => handleMoveItem("team", team, member.id, 'down')}
                                disabled={idx === team.length - 1}
                                className="p-2 border border-zinc-100 rounded-full text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 flex items-center justify-center bg-white shadow-sm cursor-pointer"
                              >
                                <ChevronRight className="rotate-[90deg]" size={12} />
                              </button>
                            </div>
                          )}
                          <div className="w-32 h-32 rounded-full overflow-hidden mx-auto mb-8 border-4 border-white shadow-2xl group-hover:scale-105 transition-transform duration-700">
                            <img 
                              src={member.photoUrl.includes('drive.google.com') ? `https://lh3.googleusercontent.com/d/${member.photoUrl.split('/d/')[1]?.split('/')[0]}` : member.photoUrl} 
                              alt={member.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <h4 className="text-xl font-bold tracking-tight mb-2 text-primary">{member.name}</h4>
                          <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-6 bg-primary/5 inline-block px-4 py-1.5 rounded-full">{member.role}</p>
                          {member.description && (
                            <ExpandableText 
                              text={member.description} 
                              limit={100} 
                              className="text-sm text-zinc-500 font-serif italic mb-6 leading-relaxed"
                            />
                          )}
                          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 border-t border-zinc-50 pt-6 cursor-default group-hover:text-primary transition-colors font-mono">
                            {member.contact}
                          </div>
                          {checkPermission("canModifyEquipe") && (
                            <button onClick={() => handleDeleteItem("team", member.id)} className="absolute top-6 right-6 text-zinc-300 hover:text-red-500 transition-colors cursor-pointer">
                              <X size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "supporters" && checkPermission("canViewSoutiens") && (
                  <div className="space-y-16 animate-fade-in">
                    <header className="flex flex-col md:flex-row justify-between items-center md:items-end gap-6 text-center md:text-left">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-300 block mb-4 italic">Backoffice // 2026</span>
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase text-primary">Liste des soutiens</h2>
                        <p className="text-zinc-400 text-xs mt-2 font-bold uppercase tracking-widest">{supportersList.length} personnes soutiennent activement votre campagne</p>
                      </div>
                      
                      {supportersList.length > 0 && (
                        <button 
                          onClick={exportSupporterToCSV}
                          className="px-6 py-3 bg-zinc-900 text-white text-[10.5px] font-bold uppercase tracking-widest rounded-full flex items-center gap-2 hover:bg-zinc-850 hover:scale-[1.02] transition-all"
                        >
                          <FileSpreadsheet size={16} />
                          Exporter vers Google Sheets (CSV)
                        </button>
                      )}
                    </header>

                    {supportersList.length === 0 ? (
                      <div className="bg-white p-16 text-center rounded-2xl border border-zinc-100 italic font-serif text-zinc-400">
                        Aucun soutien enregistré pour le moment.
                      </div>
                    ) : (
                      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-zinc-50/50 border-b border-zinc-100 text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                                <th className="p-6">Nom complet</th>
                                <th className="p-6">Niveau Univ.</th>
                                <th className="p-6">Filière</th>
                                <th className="p-6">Numéro</th>
                                <th className="p-6">Email</th>
                                <th className="p-6">Date</th>
                                <th className="p-6 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50 text-[13px] text-zinc-650">
                              {supportersList.map((sup) => (
                                <tr key={sup.id} className="hover:bg-zinc-50/20 transition-colors">
                                  <td className="p-6 font-bold text-zinc-900">{sup.fullName}</td>
                                  <td className="p-6">{sup.academicLevel}</td>
                                  <td className="p-6">
                                    <span className="px-2.5 py-1.5 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-wider rounded-full">
                                      {sup.fieldOfStudy}
                                    </span>
                                  </td>
                                  <td className="p-6 font-mono text-xs">{sup.phone}</td>
                                  <td className="p-6">{sup.email}</td>
                                  <td className="p-6 text-zinc-400 text-xs">
                                    {sup.createdAt ? new Date(sup.createdAt.seconds * 1000).toLocaleDateString("fr-FR", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    }) : "-"}
                                  </td>
                                  <td className="p-6 text-right">
                                    {checkPermission("canModifySoutiens") && (
                                      <button
                                        onClick={() => handleDeleteItem("supporters", sup.id)}
                                        className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50/50 rounded-lg transition-all"
                                        title="Supprimer ce soutien"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "tresorerie" && user && (
                  <div className="space-y-12 animate-fade-in pb-16">
                    {/* Header */}
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-2 border-b border-zinc-100">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/80 block mb-2 font-mono">SYSTEME DE TRESORERIE // BACKOFFICE</span>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase text-zinc-950">Trésorerie</h2>
                        <p className="text-zinc-500 text-sm mt-1">Gestion financière, suivi des flux et comptabilité analytique</p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-100 font-mono text-xs text-zinc-650">
                        <div className="flex items-center gap-2">
                          <Activity size={14} className="text-emerald-500 animate-pulse" />
                          <span className="font-bold uppercase tracking-wider text-[10px] text-zinc-400">Système Live:</span>
                          <span className="text-zinc-800 font-bold">Actif</span>
                        </div>
                        <div className="hidden sm:block text-zinc-300">|</div>
                        <div className="text-zinc-650 font-bold">
                          {new Date().toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric"
                          })}
                        </div>
                      </div>
                    </header>

                    {/* Financial Summary & Goals Progress */}
                    {(() => {
                      const list = financeTransactions;
                      
                      const totalIn = list.filter(t => t.type === "in" && !t.archived).reduce((acc, current) => acc + (parseFloat(String(current.amount)) || 0), 0);
                      const totalOut = list.filter(t => t.type === "out" && !t.archived).reduce((acc, current) => acc + (parseFloat(String(current.amount)) || 0), 0);
                      const currentBalance = totalIn - totalOut;

                      // Goal progression
                      const financialGoal = financeGoals.length > 0 ? (parseFloat(String(financeGoals[0].amount)) || 25000) : 25000;
                      const goalTitle = financeGoals.length > 0 ? financeGoals[0].title : "Objectif de Trésorerie";
                      const goalProgressPercentage = Math.min(100, Math.max(0, parseFloat(((currentBalance / financialGoal) * 100).toFixed(1))));

                      // Chart Area Data - Only including non-archived transactions sorted chronologically
                      const sortedTimeline = [...list]
                        .filter(t => !t.archived && t.date)
                        .sort((a, b) => {
                          const strA = a.date.includes("T") ? a.date : `${a.date}T00:00`;
                          const strB = b.date.includes("T") ? b.date : `${b.date}T00:00`;
                          const dateA = new Date(strA).getTime();
                          const dateB = new Date(strB).getTime();
                          if (dateA !== dateB) return dateA - dateB;
                          return (a.id || "").localeCompare(b.id || "");
                        });
                      
                      let cumulativeBalance = 0;
                      const chartData = [
                        {
                          index: 0,
                          name: "Début",
                          dateFull: "Solde initial",
                          description: "Fond de départ",
                          change: 0,
                          amount: 0,
                          type: "in",
                          changeStr: "0 DH",
                          Solde: 0
                        },
                        ...sortedTimeline.map((current, idx) => {
                          const dateStr = new Date(current.date).toLocaleDateString("fr-FR", { month: "short", day: "numeric" });
                          const amt = parseFloat(String(current.amount)) || 0;
                          const change = current.type === "in" ? amt : -amt;
                          cumulativeBalance += change;
                          return {
                            index: idx + 1,
                            name: dateStr,
                            dateFull: formatTransactionDate(current.date),
                            description: current.description || "",
                            change: change,
                            amount: amt,
                            type: current.type,
                            changeStr: current.type === "in" ? `+ ${amt.toLocaleString("fr-FR")} DH` : `- ${amt.toLocaleString("fr-FR")} DH`,
                            Solde: cumulativeBalance
                          };
                        })
                      ];

                      // Category Breakdown Data - non-archived transactions & expenses expressed as negative numbers for volume columns
                      const rawCategoryMap = list.filter(t => !t.archived).reduce((acc: any, current) => {
                        const cat = current.category || "Autre";
                        const amt = parseFloat(String(current.amount)) || 0;
                        const change = current.type === "in" ? amt : -amt;
                        acc[cat] = (acc[cat] || 0) + change;
                        return acc;
                      }, {});

                      const colorsMap: any = {
                        "Sponsoring": "#10B981", // Emerald
                        "Cotisation": "#3B82F6", // Blue
                        "Subvention": "#F59E0B", // Amber
                        "Événement": "#EF4444", // Red
                        "Logistique": "#8B5CF6", // Purple
                        "Communication": "#EC4899", // Pink
                        "Restauration": "#EAB308", // Yellow
                        "Transport": "#6366F1", // Indigo
                        "Impression": "#14B8A6", // Teal
                        "Remboursement": "#F97316" // Orange
                      };

                      const categoryData = Object.keys(rawCategoryMap).map(catName => ({
                        name: catName,
                        value: rawCategoryMap[catName],
                        color: colorsMap[catName] || "#64748B"
                      }));

                      return (
                        <div className="space-y-10">
                          {/* Top Metric Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Card Solde */}
                            <motion.div 
                              whileHover={{ y: -4 }}
                              className="bg-zinc-900 text-white rounded-3xl p-8 border border-zinc-850 shadow-xl overflow-hidden relative"
                            >
                              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                              <div className="flex justify-between items-start mb-6">
                                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">Solde Net Restant</span>
                                <div className="p-3 bg-zinc-800/80 rounded-2xl text-white">
                                  <Wallet size={20} />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <h3 className={`text-4xl md:text-5xl font-black tracking-tight ${currentBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {currentBalance.toLocaleString("fr-FR")} <span className="text-lg">DH</span>
                                </h3>
                                {financeGoals.length > 0 ? (
                                  <p className="text-xs text-zinc-400 flex items-center gap-1">
                                    <TrendingUp size={14} className="text-emerald-400" />
                                    <span className="text-zinc-300 font-bold font-mono">+{goalProgressPercentage}%</span> de l'objectif <strong className="text-zinc-300 font-black">"{goalTitle}"</strong> ({financialGoal.toLocaleString("fr-FR")} DH)
                                  </p>
                                ) : (
                                  <p className="text-xs text-zinc-500 font-sans">
                                    Aucun objectif de trésorerie actif
                                  </p>
                                )}
                              </div>
                              <div className="mt-8 flex items-end gap-1 h-8 opacity-40">
                                {[30, 45, 35, 60, 50, 80, 75, 95, 85, 110].map((h, i) => (
                                  <div key={i} className="flex-1 bg-emerald-400 rounded-t" style={{ height: `${h}%` }} />
                                ))}
                              </div>
                            </motion.div>

                            {/* Card Entrées */}
                            <motion.div 
                              whileHover={{ y: -4 }}
                              className="bg-white rounded-3xl p-8 border border-zinc-100 shadow-sm relative overflow-hidden"
                            >
                              <div className="flex justify-between items-start mb-6">
                                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">Total des Entrées</span>
                                <div className="p-3 bg-emerald-50 text-emerald-650 rounded-2xl">
                                  <ArrowUpRight size={20} />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-4xl md:text-5xl font-black tracking-tight text-zinc-950">
                                  {totalIn.toLocaleString("fr-FR")} <span className="text-lg font-normal text-zinc-500">DH</span>
                                </h3>
                                <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Provenance de Sponsoring & Cotisations</p>
                              </div>
                              <div className="mt-8 flex items-end gap-1 h-8 opacity-20">
                                {[20, 30, 25, 55, 45, 60, 65, 80, 95, 100].map((h, i) => (
                                  <div key={i} className="flex-1 bg-zinc-900 rounded-t" style={{ height: `${h}%` }} />
                                ))}
                              </div>
                            </motion.div>

                            {/* Card Sorties */}
                            <motion.div 
                              whileHover={{ y: -4 }}
                              className="bg-white rounded-3xl p-8 border border-zinc-100 shadow-sm relative overflow-hidden"
                            >
                              <div className="flex justify-between items-start mb-6">
                                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">Dépenses Réalisées</span>
                                <div className="p-3 bg-rose-50 text-rose-650 rounded-2xl">
                                  <ArrowDownRight size={20} />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-4xl md:text-5xl font-black tracking-tight text-zinc-950">
                                  {totalOut.toLocaleString("fr-FR")} <span className="text-lg font-normal text-zinc-500">DH</span>
                                </h3>
                                <p className="text-xs text-rose-500 font-bold uppercase tracking-wider">Logistique, impression & restauration</p>
                              </div>
                              <div className="mt-8 flex items-end gap-1 h-8 opacity-20">
                                {[10, 40, 20, 50, 35, 70, 45, 60, 55, 90].map((h, i) => (
                                  <div key={i} className="flex-1 bg-rose-500 rounded-t" style={{ height: `${h}%` }} />
                                ))}
                              </div>
                            </motion.div>
                          </div>

                          {/* Quick Actions Panel */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-zinc-50 p-6 rounded-3xl border border-zinc-100 shadow-inner">
                            <button
                              onClick={() => {
                                if (!checkPermission("canModifyTresorerie")) return;
                                setIncomeForm({
                                  amount: "",
                                  source: "",
                                  category: "Sponsoring",
                                  description: "",
                                  date: new Date().toISOString().split("T")[0],
                                  attachmentUrl: ""
                                });
                                setShowAddIncomeModal(true);
                              }}
                              className={`group p-8 rounded-2xl border transition-all duration-300 flex items-center justify-between text-left shadow-sm ${checkPermission("canModifyTresorerie") ? "bg-white border-zinc-150 hover:bg-zinc-950 hover:text-white hover:shadow-lg cursor-pointer" : "bg-zinc-100/50 border-zinc-100 opacity-60 cursor-not-allowed"}`}
                            >
                              <div className="space-y-1.5 text-left">
                                <div className="p-3.5 bg-emerald-50 group-hover:bg-emerald-500/10 text-emerald-600 rounded-2xl inline-block mb-3 transition-colors">
                                  <Plus size={24} />
                                </div>
                                <h4 className="text-xl font-black tracking-tight uppercase">Ajouter de l'argent</h4>
                                <p className="text-xs text-zinc-400 font-medium">Revenu de sponsor, cotisation, subvention, etc.</p>
                              </div>
                              <ChevronRight size={22} className="text-zinc-350 group-hover:translate-x-1.5 transition-transform" />
                            </button>

                            <button
                              onClick={() => {
                                if (!checkPermission("canModifyTresorerie")) return;
                                setExpenseForm({
                                  amount: "",
                                  description: "",
                                  category: "Événement",
                                  responsible: "",
                                  date: new Date().toISOString().split("T")[0],
                                  attachmentUrl: "",
                                  priority: "Moyenne"
                                });
                                setShowAddExpenseModal(true);
                              }}
                              className={`group p-8 rounded-2xl border transition-all duration-300 flex items-center justify-between text-left shadow-sm ${checkPermission("canModifyTresorerie") ? "bg-white border-zinc-150 hover:bg-zinc-950 hover:text-white hover:shadow-lg cursor-pointer" : "bg-zinc-100/50 border-zinc-100 opacity-60 cursor-not-allowed"}`}
                            >
                              <div className="space-y-1.5 text-left">
                                <div className="p-3.5 bg-rose-50 group-hover:bg-rose-500/10 text-rose-600 rounded-2xl inline-block mb-3 transition-colors">
                                  <Trash2 size={24} className="text-rose-500" />
                                </div>
                                <h4 className="text-xl font-black tracking-tight uppercase">Retirer de l'argent</h4>
                                <p className="text-xs text-rose-500/70 group-hover:text-rose-400 font-medium">Motif détaillé, responsable et justificatifs...</p>
                              </div>
                              <ChevronRight size={22} className="text-zinc-350 group-hover:translate-x-1.5 transition-transform" />
                            </button>
                          </div>

                          {/* Category Switcher Tabs */}
                          <div className="border-b border-zinc-100 flex gap-2 overflow-x-auto scrollbar-none pt-2">
                            {[
                              { id: 'overview', label: "Vue financière" },
                              { id: 'ledger', label: "Relevé détaillé" },
                              { id: 'analytics', label: "Statistiques" },
                              { id: 'goals', label: "Objectifs" }
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                onClick={() => setFinanceSubTab(tab.id as any)}
                                className={`
                                  px-6 py-4 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all shrink-0
                                  ${financeSubTab === tab.id 
                                    ? "border-primary text-primary" 
                                    : "border-transparent text-zinc-400 hover:text-zinc-950"}
                                `}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          {/* Overview Dashboard view */}
                          {financeSubTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
                              {/* Left Columns - Activities timeline */}
                              <div className="lg:col-span-8 space-y-8">
                                <div className="flex justify-between items-center">
                                  <h4 className="text-xl font-black text-zinc-950 uppercase tracking-tight">Activité Récente</h4>
                                  <button onClick={() => setFinanceSubTab('ledger')} className="text-xs text-primary font-bold hover:underline">Consulter tout le livre</button>
                                </div>

                                <div className="space-y-4">
                                  {list.slice(0, 5).map((t) => (
                                    <div 
                                      key={t.id} 
                                      className="flex items-center justify-between p-5 bg-white border border-zinc-100 rounded-2xl hover:border-zinc-200 transition-all shadow-sm group"
                                    >
                                      <div className="flex items-center gap-4">
                                        <div className={`
                                          w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm
                                          ${t.type === "in" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}
                                        `}>
                                          {t.type === "in" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-zinc-950 text-sm">{t.description}</span>
                                            {t.favorite && <Star size={13} className="fill-yellow-400 text-yellow-400" />}
                                          </div>
                                          <div className="flex items-center gap-2.5 text-xs text-zinc-400 mt-1">
                                            <span className="font-semibold text-zinc-700 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-150">{t.category}</span>
                                            <span>•</span>
                                            <span>Responsable: <strong className="text-zinc-650">{t.responsible}</strong></span>
                                            <span>•</span>
                                            <span className="font-mono text-[11px]">{formatTransactionDate(t.date)}</span>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-4">
                                        <span className={`text-sm font-black font-mono ${t.type === "in" ? "text-emerald-600" : "text-rose-500"}`}>
                                          {t.type === "in" ? "+" : "-"}{t.amount.toLocaleString("fr-FR")} DH
                                        </span>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button 
                                            onClick={() => toggleTransactionFavorite(t.id, !!t.favorite)}
                                            className="p-1.5 text-zinc-400 hover:text-yellow-500 rounded hover:bg-zinc-50"
                                          >
                                            <Star size={14} className={t.favorite ? "fill-yellow-400 text-yellow-400" : ""} />
                                          </button>
                                          {checkPermission("canModifyTresorerie") && (
                                            <button 
                                              onClick={() => handleDeleteItem("financeTransactions", t.id)}
                                              className="p-1.5 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50 cursor-pointer"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Right column - Target Progress, Mini Calendar Expense view, Notes */}
                              <div className="lg:col-span-4 space-y-8">
                                {/* Target widgets */}
                                {financeGoals.length > 0 ? (
                                  <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-4">
                                    <div className="flex justify-between items-center">
                                      <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase">Objectif Trésor</h4>
                                      <Target className="text-primary animate-pulse" size={16} />
                                    </div>
                                    <div>
                                      <div className="flex justify-between items-end mb-2">
                                        <span className="text-lg font-black text-zinc-950">{currentBalance.toLocaleString("fr-FR")} DH</span>
                                        <span className="text-xs font-bold text-zinc-450">Seuil: {financialGoal.toLocaleString("fr-FR")} DH</span>
                                      </div>
                                      <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${currentBalance >= financialGoal ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${goalProgressPercentage}%` }} />
                                      </div>
                                      <div className="flex justify-between text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-1.5 flex-wrap gap-1">
                                        <span className="truncate max-w-[120px]" title={goalTitle}>"{goalTitle}"</span>
                                        <span>{goalProgressPercentage}% atteint</span>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-white border border-dashed border-zinc-200 rounded-3xl p-6 shadow-sm text-center py-8 space-y-2">
                                    <p className="text-xs text-zinc-400 font-sans">Aucun objectif de trésorerie actif</p>
                                    <button 
                                      onClick={() => {
                                        setGoalForm({ title: "", amount: "", description: "" });
                                        setShowAddGoalModal(true);
                                      }}
                                      className="text-[10px] font-black uppercase text-primary tracking-widest hover:underline font-sans"
                                    >
                                      Créer un objectif +
                                    </button>
                                  </div>
                                )}

                                {/* Calendar of the month pastilles */}
                                <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-4">
                                  <div className="flex justify-between items-center border-b border-zinc-50 pb-3">
                                    <div className="space-y-0.5">
                                      <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase">Journée des flux</h4>
                                      <h5 className="text-sm font-bold text-zinc-950 font-sans">
                                        {(() => {
                                          const monthNamesFR = [
                                            "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                                            "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
                                          ];
                                          return `${monthNamesFR[calendarMonth]} ${calendarYear}`;
                                        })()}
                                      </h5>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={() => {
                                          if (calendarMonth === 0) {
                                            setCalendarMonth(11);
                                            setCalendarYear(prev => prev - 1);
                                          } else {
                                            setCalendarMonth(prev => prev - 1);
                                          }
                                        }}
                                        className="p-1.5 hover:bg-zinc-100 rounded-xl text-zinc-500 hover:text-zinc-950 transition-colors"
                                        title="Mois précédent"
                                      >
                                        <ChevronLeft size={16} />
                                      </button>
                                      <button 
                                        onClick={() => {
                                          if (calendarMonth === 11) {
                                            setCalendarMonth(0);
                                            setCalendarYear(prev => prev + 1);
                                          } else {
                                            setCalendarMonth(prev => prev + 1);
                                          }
                                        }}
                                        className="p-1.5 hover:bg-zinc-100 rounded-xl text-zinc-500 hover:text-zinc-950 transition-colors"
                                        title="Mois suivant"
                                      >
                                        <ChevronRight size={16} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px]">
                                    {["L", "M", "M", "J", "V", "S", "D"].map((day, ix) => (
                                      <div key={ix} className="font-bold text-zinc-400 py-1">{day}</div>
                                    ))}
                                    
                                    {/* Offset first day of month */}
                                    {(() => {
                                      const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                                      const rawFirstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay(); // Sunday is 0, Monday is 1...
                                      // Align with Mon-Sun grid: mapped so Mon is 0, Tue is 1, ..., Sun is 6
                                      const startingDayOfWeek = (rawFirstDayIndex === 0 ? 6 : rawFirstDayIndex - 1);
                                      
                                      const emptyDays = Array.from({ length: startingDayOfWeek }).map((_, i) => (
                                        <div key={`empty-${i}`} className="h-9" />
                                      ));
                                      
                                      const activeDays = Array.from({ length: daysInMonth }).map((_, inx) => {
                                        const dayNum = inx + 1;
                                        const monthStr = String(calendarMonth + 1).padStart(2, '0');
                                        const dayStr = `${calendarYear}-${monthStr}-${String(dayNum).padStart(2, '0')}`;
                                        const dayTrans = list.filter(t => t.date ? t.date.startsWith(dayStr) : false);
                                        const hasIn = dayTrans.some(t => t.type === "in");
                                        const hasOut = dayTrans.some(t => t.type === "out");
                                        
                                        const isToday = (calendarYear === 2026 && calendarMonth === 4 && dayNum === 23) || (
                                          new Date().getFullYear() === calendarYear &&
                                          new Date().getMonth() === calendarMonth &&
                                          new Date().getDate() === dayNum
                                        );

                                        return (
                                          <div 
                                            key={inx} 
                                            className={`
                                              p-1 rounded-lg border border-transparent flex flex-col justify-between h-9 transition-all
                                              ${isToday ? "bg-primary text-white font-bold shadow-sm shadow-primary/20" : "text-zinc-800 bg-zinc-50/50 hover:bg-zinc-100/70"}
                                            `}
                                            title={`${dayTrans.length} transaction(s)`}
                                          >
                                            <span className="text-[10px]">{dayNum}</span>
                                            <div className="flex justify-center gap-[1px]">
                                              {hasIn && <div className="w-1 h-1 rounded-full bg-emerald-500" />}
                                              {hasOut && <div className="w-1 h-1 rounded-full bg-rose-500" />}
                                            </div>
                                          </div>
                                        );
                                      });

                                      return [...emptyDays, ...activeDays];
                                    })()}
                                  </div>
                                </div>

                                {/* Notes section */}
                                <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-3">
                                  <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase">Bloc-Notes Comptabilité</h4>
                                  <textarea
                                    value={internalNotes}
                                    onChange={(e) => handleUpdateInternalNotes(e.target.value)}
                                    placeholder={checkPermission("canModifyTresorerie") ? "Ajouter des annotations ou mémos comptables ici..." : "Mode lecture seule actif pour le bloc-notes."}
                                    disabled={!checkPermission("canModifyTresorerie")}
                                    rows={4}
                                    className={`w-full bg-zinc-50 border border-zinc-100 rounded-2xl p-4 text-xs font-serif leading-relaxed outline-none transition-all resize-none ${checkPermission("canModifyTresorerie") ? "focus:border-primary focus:bg-white" : "cursor-not-allowed opacity-70"}`}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Account Ledger Detailed Table views */}
                          {financeSubTab === 'ledger' && (
                            <section className="space-y-6 animate-fade-in">
                              
                              {/* Filter, select, and search bars */}
                              <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-zinc-50 p-4 rounded-3xl border border-zinc-150 shadow-inner">
                                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                                  {/* Search input to filter */}
                                  <div className="relative flex-1 sm:w-64">
                                    <Search className="absolute left-4 top-3.5 text-zinc-400" size={16} />
                                    <input 
                                      type="text" 
                                      placeholder="Mémo, catégorie, responsable..."
                                      value={financeSearch}
                                      onChange={(e) => setFinanceSearch(e.target.value)}
                                      className="w-full pl-10 pr-4 py-3 bg-white border border-zinc-200 rounded-2xl outline-none focus:border-primary text-xs"
                                    />
                                  </div>

                                  {/* Filter types */}
                                  <select
                                    value={financeTypeFilter}
                                    onChange={(e) => setFinanceTypeFilter(e.target.value)}
                                    className="px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-xs outline-none focus:border-primary font-bold"
                                  >
                                    <option value="all">Tous les types</option>
                                    <option value="in">Entrées (+)</option>
                                    <option value="out">Sorties (-)</option>
                                  </select>

                                  {/* Filter cats */}
                                  <select
                                    value={financeCatFilter}
                                    onChange={(e) => setFinanceCatFilter(e.target.value)}
                                    className="px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-xs outline-none focus:border-primary font-bold"
                                  >
                                    <option value="all">Toutes catégories</option>
                                    <option value="Sponsoring">Sponsoring</option>
                                    <option value="Cotisation">Cotisation</option>
                                    <option value="Subvention">Subvention</option>
                                    <option value="Événement">Événement</option>
                                    <option value="Logistique">Logistique</option>
                                    <option value="Communication">Communication</option>
                                    <option value="Restauration">Restauration</option>
                                    <option value="Transport">Transport</option>
                                    <option value="Impression">Impression</option>
                                    <option value="Remboursement">Remboursement</option>
                                  </select>
                                </div>

                                <div className="flex items-center gap-3 w-full sm:w-auto justify-between xl:justify-end">
                                  {/* Sort elements */}
                                  <select
                                    value={financeSortBy}
                                    onChange={(e) => setFinanceSortBy(e.target.value)}
                                    className="px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-xs outline-none focus:border-primary font-bold"
                                  >
                                    <option value="newest">Plus récentes</option>
                                    <option value="oldest">Plus anciennes</option>
                                    <option value="amountDesc">Montants élevés</option>
                                    <option value="amountAsc">Montants faibles</option>
                                    <option value="favorites">Éléments Favoris</option>
                                  </select>

                                  <button
                                    onClick={exportFinanceToCSV}
                                    className="px-5 py-3 bg-zinc-950 hover:bg-zinc-850 text-white rounded-2xl text-[10.5px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm"
                                  >
                                    <Download size={14} />
                                    <span>Export CSV</span>
                                  </button>
                                </div>
                              </div>

                              {/* Ledger table markup design */}
                              {(() => {
                                const listToFilter = financeTransactions;
                                const term = financeSearch.toLowerCase();
                                const filtered = listToFilter.filter(t => {
                                  const textMatch = 
                                    (t.description || "").toLowerCase().includes(term) ||
                                    (t.category || "").toLowerCase().includes(term) ||
                                    (t.responsible || "").toLowerCase().includes(term);
                                  
                                  const typeMatch = financeTypeFilter === "all" || t.type === financeTypeFilter;
                                  const catMatch = financeCatFilter === "all" || t.category === financeCatFilter;

                                  return textMatch && typeMatch && catMatch;
                                }).sort((a,b) => {
                                  const strA = a.date ? (a.date.includes("T") ? a.date : `${a.date}T00:00`) : "1970-01-01T00:00";
                                  const strB = b.date ? (b.date.includes("T") ? b.date : `${b.date}T00:00`) : "1970-01-01T00:00";
                                  if (financeSortBy === "newest") return new Date(strB).getTime() - new Date(strA).getTime();
                                  if (financeSortBy === "oldest") return new Date(strA).getTime() - new Date(strB).getTime();
                                  if (financeSortBy === "amountDesc") return b.amount - a.amount;
                                  if (financeSortBy === "amountAsc") return a.amount - b.amount;
                                  if (financeSortBy === "favorites") return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
                                  return 0;
                                });

                                if (filtered.length === 0) {
                                  return (
                                    <div className="bg-white p-12 text-center rounded-2xl border border-zinc-100 italic text-zinc-400">
                                      Aucune transaction trouvée.
                                    </div>
                                  );
                                }

                                return (
                                  <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left border-collapse">
                                        <thead>
                                          <tr className="bg-zinc-50/50 border-b border-zinc-100 text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                                            <th className="p-6">Type & Motif</th>
                                            <th className="p-6">Montant</th>
                                            <th className="p-6">Catégorie</th>
                                            <th className="p-6">Responsable</th>
                                            <th className="p-6">Date transaction</th>
                                            <th className="p-6">Pièce jointe</th>
                                            <th className="p-6 text-right">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-50 text-[13px] text-zinc-650">
                                          {filtered.map((t) => (
                                            <tr key={t.id} className="hover:bg-zinc-50/20 transition-all group">
                                              {/* Description */}
                                              <td className="p-6">
                                                <div className="flex items-center gap-3">
                                                  <div className={`
                                                    w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0
                                                    ${t.type === "in" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}
                                                  `}>
                                                    {t.type === "in" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                                  </div>
                                                  <div>
                                                    <div className="flex items-center gap-1.5">
                                                      <span className="font-bold text-zinc-950 text-sm leading-tight">{t.description}</span>
                                                      {t.favorite && <Star size={12} className="fill-yellow-400 text-yellow-400 shrink-0" />}
                                                    </div>
                                                    {t.type === "out" && t.priority && (
                                                      <span className={`
                                                        text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mt-0.5
                                                        ${t.priority === "Haute" ? "bg-rose-50 text-rose-600 border border-rose-100" : t.priority === "Moyenne" ? "bg-amber-50 text-amber-600" : "bg-zinc-100 text-zinc-500"}
                                                      `}>
                                                        Priorité {t.priority}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </td>

                                              {/* Montant */}
                                              <td className="p-6">
                                                <span className={`font-mono font-black text-sm ${t.type === "in" ? "text-emerald-600" : "text-rose-500"}`}>
                                                  {t.type === "in" ? "+" : "-"}{t.amount.toLocaleString("fr-FR")} DH
                                                </span>
                                              </td>

                                              {/* Categorie */}
                                              <td className="p-6">
                                                <span className="px-2.5 py-1 text-zinc-550 bg-zinc-50 border border-zinc-150 rounded-full font-bold text-[10px] tracking-wider uppercase">
                                                  {t.category}
                                                </span>
                                              </td>

                                              {/* Payeur / Responsable */}
                                              <td className="p-6 text-zinc-850 font-medium">
                                                {t.responsible}
                                              </td>

                                              {/* Date transaction */}
                                              <td className="p-6 text-zinc-450 font-mono text-xs">
                                                {formatTransactionDate(t.date)}
                                              </td>

                                              {/* Justif cliquable */}
                                              <td className="p-6">
                                                {t.attachmentUrl ? (
                                                  <a 
                                                    href={t.attachmentUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-bold"
                                                  >
                                                    <Paperclip size={13} className="shrink-0" />
                                                    <span className="font-mono text-[10px] uppercase tracking-wider">Lien Drive</span>
                                                  </a>
                                                ) : (
                                                  <span className="text-zinc-350 italic text-[11px]">- Aucun -</span>
                                                )}
                                              </td>

                                              {/* Deletion & star actions */}
                                              <td className="p-6 text-right">
                                                <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <button 
                                                    onClick={() => toggleTransactionFavorite(t.id, !!t.favorite)}
                                                    className="p-1.5 text-zinc-400 hover:text-yellow-500 hover:bg-yellow-55/70 rounded-lg transition-colors border border-transparent hover:border-yellow-200"
                                                    title="Mettre en favori"
                                                  >
                                                    <Star size={15} className={t.favorite ? "fill-yellow-400 text-yellow-400" : ""} />
                                                  </button>
                                                  
                                                  <button
                                                    onClick={() => handleDeleteItem("financeTransactions", t.id)}
                                                    className="p-1.5 text-zinc-455 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Supprimer la transaction"
                                                  >
                                                    <Trash2 size={15} />
                                                  </button>
                                                </div>
                                              </td>

                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                  );
                              })()}
                            </section>
                          )}

                          {/* Recharts Analytics dashboard */}
                          {financeSubTab === 'analytics' && (
                            <div className="space-y-10 animate-fade-in">
                              
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* area chart */}
                                <div className="bg-white border border-zinc-150 shadow-sm p-6 rounded-3xl space-y-4">
                                  <div>
                                    <span className="text-[9px] font-black tracking-widest text-zinc-400 uppercase">Evolution</span>
                                    <h4 className="text-xl font-bold text-zinc-950 uppercase tracking-tight">Flux de comptabilité net</h4>
                                  </div>
                                  <div className="h-72 w-full pt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                        <defs>
                                          <linearGradient id="colorBalanceTab" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                          </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                                        <XAxis 
                                          dataKey="index" 
                                          tickFormatter={(tick) => {
                                            return chartData[tick]?.name || '';
                                          }}
                                          stroke="#a1a1aa" 
                                          fontSize={10} 
                                          tickLine={false} 
                                        />
                                        <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} />
                                        <Tooltip content={({ active, payload }: any) => {
                                          if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            const isPositive = data.change >= 0;
                                            return (
                                              <div className="bg-zinc-950 text-white p-4 rounded-2xl border border-zinc-800 shadow-2xl text-[11px] space-y-2 text-left">
                                                <div className="flex justify-between items-center gap-4 text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
                                                  <span>{data.name}</span>
                                                  <span className="font-mono">{data.dateFull}</span>
                                                </div>
                                                <p className="font-bold text-zinc-100 max-w-[180px] leading-tight break-words">
                                                  {data.description}
                                                </p>
                                                <div className="border-t border-zinc-905 pt-2 space-y-1">
                                                  <div className="flex justify-between items-center gap-6">
                                                    <span className="text-zinc-400 font-medium">Transaction:</span>
                                                    <span className={`font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                      {data.changeStr}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between items-center gap-6 border-t border-zinc-900 pt-1.5 mt-1">
                                                    <span className="text-zinc-400 font-bold text-[9px] uppercase tracking-wider">Solde Cumulé:</span>
                                                    <span className="font-mono font-black text-blue-400">
                                                      {data.Solde.toLocaleString("fr-FR")} DH
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          }
                                          return null;
                                        }} />
                                        <Area type="monotone" dataKey="Solde" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBalanceTab)" />
                                      </AreaChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>

                                {/* bar chart */}
                                <div className="bg-white border border-zinc-150 shadow-sm p-6 rounded-3xl space-y-4">
                                  <div>
                                    <span className="text-[9px] font-black tracking-widest text-zinc-400 uppercase">Repartition</span>
                                    <h4 className="text-xl font-bold text-zinc-950 uppercase tracking-tight">Répartition par volume</h4>
                                  </div>
                                  <div className="h-72 w-full pt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={categoryData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={9} tickLine={false} />
                                        <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} />
                                        <Tooltip content={({ active, payload }: any) => {
                                          if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            const val = parseFloat(String(data.value)) || 0;
                                            const isPositive = val >= 0;
                                            return (
                                              <div className="bg-zinc-950 text-white p-4 rounded-2xl border border-zinc-800 shadow-2xl text-[11px] space-y-1.5 text-left">
                                                <div className="flex items-center gap-2">
                                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
                                                  <span className="font-bold text-zinc-200 uppercase tracking-tight text-[10px]">{data.name}</span>
                                                </div>
                                                <div className="border-t border-zinc-900 pt-1.5 flex justify-between items-center gap-6">
                                                  <span className="text-zinc-400 font-medium">Volume Net :</span>
                                                  <span className={`font-mono font-black ${isPositive ? 'text-emerald-400' : 'text-rose-450'}`}>
                                                    {isPositive ? '+' : ''}{val.toLocaleString("fr-FR")} DH
                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          }
                                          return null;
                                        }} />
                                        <ReferenceLine y={0} stroke="#cbd5e0" strokeWidth={1} />
                                        <Bar dataKey="value" radius={4}>
                                          {categoryData.map((entry, index) => (
                                            <Cell key={`cell-tab-${index}`} fill={entry.color} />
                                          ))}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              </div>

                            </div>
                          )}

                          {/* Financial Goals Subtab View */}
                          {financeSubTab === 'goals' && (
                            <div className="space-y-8 animate-fade-in">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                  <h4 className="text-xl font-black text-zinc-950 uppercase tracking-tight font-sans">Objectifs de Trésorerie</h4>
                                  <p className="text-xs text-zinc-400 mt-0.5 font-sans">Configurez et analysez vos différents objectifs de financement</p>
                                </div>
                                <button
                                  onClick={() => {
                                    setGoalForm({ title: "", amount: "", description: "" });
                                    setShowAddGoalModal(true);
                                  }}
                                  className="flex items-center gap-2 px-6 py-3 bg-zinc-900 border border-zinc-800 text-white rounded-2xl hover:bg-primary hover:border-primary text-xs font-black uppercase tracking-wider transition-all shadow-sm"
                                >
                                  <Plus size={16} /> Ajouter un objectif
                                </button>
                              </div>

                              {financeGoals.length === 0 ? (
                                <div className="text-center py-16 bg-zinc-50 border border-dashed border-zinc-200 rounded-3xl space-y-4">
                                  <div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-100 text-zinc-400 rounded-full">
                                    <Target size={32} />
                                  </div>
                                  <div className="space-y-1 max-w-sm mx-auto">
                                    <h5 className="text-sm font-bold text-zinc-950 uppercase tracking-tight">Aucun objectif défini</h5>
                                    <p className="text-xs text-zinc-400">Le système n'a trouvé aucun objectif de trésorerie. Ajoutez-en un pour suivre la progression de vos campagnes.</p>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setGoalForm({ title: "", amount: "", description: "" });
                                      setShowAddGoalModal(true);
                                    }}
                                    className="px-5 py-2.5 bg-white border border-zinc-200 text-zinc-950 hover:bg-zinc-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                                  >
                                    Initialiser un objectif
                                  </button>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                  {financeGoals.map((g) => {
                                    const goalAmt = parseFloat(g.amount) || 25000;
                                    const pct = Math.min(100, Math.max(0, parseFloat(((currentBalance / goalAmt) * 100).toFixed(1))));
                                    const isReached = currentBalance >= goalAmt;

                                    return (
                                      <div 
                                        key={g.id} 
                                        className="bg-white border border-zinc-150 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6 relative overflow-hidden text-left"
                                        id={`goal-item-${g.id}`}
                                      >
                                        {isReached && (
                                          <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl flex items-center gap-1">
                                            <Sparkles size={10} /> Atteint
                                          </div>
                                        )}
                                        
                                        <div className="space-y-2">
                                          <div className="inline-flex items-center justify-center p-2.5 bg-zinc-50 border border-zinc-100 rounded-xl text-zinc-700">
                                            <Target size={18} />
                                          </div>
                                          <div>
                                            <h5 className="font-bold text-zinc-950 line-clamp-1">{g.title || "Sans Titre"}</h5>
                                            <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5 min-h-[2rem] font-sans">{g.description || "Aucune description fournie."}</p>
                                          </div>
                                        </div>

                                        <div className="space-y-3">
                                          {/* Target Details */}
                                          <div className="flex justify-between items-end">
                                            <div className="space-y-0.5">
                                              <span className="text-[9px] font-black tracking-widest text-zinc-400 uppercase">Cible</span>
                                              <h6 className="font-mono text-sm font-bold text-zinc-950">{goalAmt.toLocaleString("fr-FR")} DH</h6>
                                            </div>
                                            <div className="text-right space-y-0.5">
                                              <span className="text-[9px] font-black tracking-widest text-zinc-400 uppercase">Progression</span>
                                              <h6 className="font-mono text-sm font-bold text-primary">{pct}%</h6>
                                            </div>
                                          </div>

                                          {/* Progress Bar Container */}
                                          <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                                            <div 
                                              className={`h-full transition-all duration-1000 ${isReached ? 'bg-emerald-500' : 'bg-primary'}`} 
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>

                                          {/* Mini Status info */}
                                          <p className="text-[10px] text-zinc-400 font-sans">
                                            {isReached 
                                              ? "Félicitations ! Objectif validé avec succès." 
                                              : `Il manque ${(goalAmt - currentBalance).toLocaleString("fr-FR")} DH.`}
                                          </p>
                                        </div>

                                        {/* Actions */}
                                        <div className="border-t border-zinc-100 pt-4 flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <button
                                              id={`btn-edit-goal-${g.id}`}
                                              onClick={() => {
                                                setGoalForm({
                                                  title: g.title || "",
                                                  amount: String(g.amount || ""),
                                                  description: g.description || ""
                                                });
                                                setShowEditGoalModal(g);
                                              }}
                                              className="px-4 py-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 rounded-xl text-xs font-bold text-zinc-700 transition-all flex items-center gap-1.5 font-sans"
                                            >
                                              Modifier
                                            </button>
                                            
                                            {/* Order adjusters */}
                                            <div className="flex items-center gap-1">
                                              <button 
                                                onClick={() => handleMoveItem("financeGoals", financeGoals, g.id, 'up')}
                                                disabled={financeGoals.findIndex(f => f.id === g.id) === 0}
                                                className="p-1.5 border border-zinc-100 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-30 transition-all bg-white flex items-center justify-center cursor-pointer"
                                                title="Déplacer vers le haut"
                                              >
                                                <ChevronRight className="rotate-[-90deg]" size={12} />
                                              </button>
                                              <button 
                                                onClick={() => handleMoveItem("financeGoals", financeGoals, g.id, 'down')}
                                                disabled={financeGoals.findIndex(f => f.id === g.id) === financeGoals.length - 1}
                                                className="p-1.5 border border-zinc-100 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-30 transition-all bg-white flex items-center justify-center cursor-pointer"
                                                title="Déplacer vers le bas"
                                              >
                                                <ChevronRight className="rotate-[90deg]" size={12} />
                                              </button>
                                            </div>
                                          </div>
                                          {deleteConfirmGoalId === g.id ? (
                                            <div className="flex items-center gap-1.5 animate-fade-in">
                                              <button
                                                id={`btn-confirm-delete-goal-${g.id}`}
                                                onClick={() => {
                                                  handleDeleteGoal(g.id);
                                                  setDeleteConfirmGoalId(null);
                                                }}
                                                className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-rose-700 transition-colors font-sans cursor-pointer"
                                                title="Confirmer la suppression"
                                              >
                                                Sûr ?
                                              </button>
                                              <button
                                                onClick={() => setDeleteConfirmGoalId(null)}
                                                className="px-3 py-1.5 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-zinc-200 transition-colors font-sans cursor-pointer"
                                              >
                                                Non
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              id={`btn-delete-goal-${g.id}`}
                                              onClick={() => {
                                                setDeleteConfirmGoalId(g.id);
                                              }}
                                              className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all h-9 w-9 flex items-center justify-center border border-zinc-100 cursor-pointer"
                                              title="Supprimer l'objectif"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeTab === "agenda" && checkPermission("canViewAgenda") && (
                  <div className="space-y-12 animate-fade-in pb-16">
                    {/* Header */}
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-2 border-b border-zinc-100">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary block mb-2 font-mono">WORKSPACE DE L'ÉQUIPE // AGENDA INTERNE</span>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase text-zinc-950">Agenda & Notes</h2>
                        <p className="text-zinc-500 text-sm mt-1 font-sans">Planifiez le calendrier de la campagne électorale et collaborez en temps réel</p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-100 font-mono text-xs text-zinc-650">
                        <div className="flex items-center gap-2">
                          <Activity size={14} className="text-primary animate-pulse" />
                          <span className="font-bold uppercase tracking-wider text-[10px] text-zinc-400 font-sans">Statut:</span>
                          <span className="text-zinc-800 font-bold font-sans">Synchronisé</span>
                        </div>
                      </div>
                    </header>

                    {/* Main Layout Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      
                      {/* Left Block: Notion-style Calendar (8 cols) */}
                      <div className="lg:col-span-8 bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-50 pb-5">
                          <div>
                            <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase font-sans mb-1">Calendrier Interactif</h4>
                            <h3 className="text-2xl font-black text-zinc-950 font-sans">
                              {(() => {
                                const listFR = [
                                  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                                  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
                                ];
                                return `${listFR[agendaMonth]} ${agendaYear}`;
                              })()}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1.5 self-stretch sm:self-auto justify-end">
                            <button
                              onClick={() => {
                                const now = new Date();
                                setAgendaYear(now.getFullYear());
                                setAgendaMonth(now.getMonth());
                              }}
                              className="px-3 py-1.5 bg-zinc-55 border border-zinc-100 rounded-xl text-[10px] font-black uppercase text-zinc-700 tracking-wider hover:bg-zinc-100 transition-all font-sans cursor-pointer mr-2"
                            >
                              Aujourd'hui
                            </button>
                            <button 
                              onClick={() => {
                                if (agendaMonth === 0) {
                                  setAgendaMonth(11);
                                  setAgendaYear(prev => prev - 1);
                                } else {
                                  setAgendaMonth(prev => prev - 1);
                                }
                              }}
                              className="p-2 border border-zinc-100 hover:bg-zinc-100 rounded-xl text-zinc-650 hover:text-zinc-950 transition-colors cursor-pointer"
                              title="Mois précédent"
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                if (agendaMonth === 11) {
                                  setAgendaMonth(0);
                                  setAgendaYear(prev => prev + 1);
                                } else {
                                  setAgendaMonth(prev => prev + 1);
                                }
                              }}
                              className="p-2 border border-zinc-100 hover:bg-zinc-100 rounded-xl text-zinc-650 hover:text-zinc-950 transition-colors cursor-pointer"
                              title="Mois suivant"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-2">
                          {/* Week headers */}
                          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d, i) => (
                            <div key={i} className="text-center font-bold text-[10px] uppercase tracking-wider text-zinc-400 py-2.5 font-mono border-b border-zinc-50">
                              {d}
                            </div>
                          ))}

                          {(() => {
                            const daysInMonth = new Date(agendaYear, agendaMonth + 1, 0).getDate();
                            const rawFirstDayIndex = new Date(agendaYear, agendaMonth, 1).getDay(); // Sunday is 0, Monday is 1...
                            const startingDayOfWeek = (rawFirstDayIndex === 0 ? 6 : rawFirstDayIndex - 1);
                            
                            const emptyDays = Array.from({ length: startingDayOfWeek }).map((_, i) => (
                              <div key={`empty-${i}`} className="min-h-[100px] bg-zinc-50/20 border border-zinc-50 rounded-2xl opacity-40" />
                            ));
                            
                            const activeDays = Array.from({ length: daysInMonth }).map((_, inx) => {
                              const dayNum = inx + 1;
                              const monthStr = String(agendaMonth + 1).padStart(2, '0');
                              const dayStr = `${agendaYear}-${monthStr}-${String(dayNum).padStart(2, '0')}`;
                              const dayEvents = agendaEvents.filter(e => e.date === dayStr);
                              
                              const isToday = (
                                new Date().getFullYear() === agendaYear &&
                                new Date().getMonth() === agendaMonth &&
                                new Date().getDate() === dayNum
                              );

                              return (
                                <div 
                                  key={inx} 
                                  onClick={() => {
                                    setEventForm({ title: "", category: "Réunion", importance: "Moyenne", description: "" });
                                    setShowAddEventModalDate(dayStr);
                                  }}
                                  className={`
                                    min-h-[100px] p-2 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer group hover:bg-zinc-50/55 hover:border-zinc-200 hover:shadow-sm relative
                                    ${isToday 
                                      ? "bg-rose-50/20 border-primary" 
                                      : "bg-white border-zinc-100"
                                    }
                                  `}
                                >
                                  {/* Day index number */}
                                  <div className="flex justify-between items-center mb-1">
                                    <span className={`
                                      text-[10px] font-mono font-bold w-5 h-5 flex items-center justify-center rounded-full
                                      ${isToday ? "bg-primary text-white" : "text-zinc-600"}
                                    `}>
                                      {dayNum}
                                    </span>
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary font-black text-xs">
                                      +
                                    </span>
                                  </div>

                                  {/* Stacking day events list */}
                                  <div className="flex-grow space-y-1 overflow-y-auto max-h-[75px] scrollbar-none" onClick={(e) => e.stopPropagation()}>
                                    {dayEvents.map((ev) => {
                                      // Custom class per category card
                                      const cat = String(ev.category || "").trim().toLowerCase();
                                      let colClasses = "bg-zinc-100 text-zinc-700 border-zinc-200";
                                      if (cat === "réunion" || cat === "reunion") colClasses = "bg-blue-50 text-blue-700 border-blue-100";
                                      else if (cat === "conférence" || cat === "conference") colClasses = "bg-purple-50 text-purple-700 border-purple-100";
                                      else if (cat === "événement" || cat === "evenement" || cat === "evenement") colClasses = "bg-rose-50 text-rose-700 border-rose-100";
                                      else if (cat === "visite") colClasses = "bg-emerald-50 text-emerald-700 border-emerald-100";
                                      else if (cat === "autre") colClasses = "bg-zinc-150 text-zinc-700 border-zinc-200";

                                      return (
                                        <div
                                          key={ev.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEventForm({
                                              title: ev.title || "",
                                              category: ev.category || "Réunion",
                                              importance: ev.importance || "Moyenne",
                                              description: ev.description || ""
                                            });
                                            setShowEventDetails(ev);
                                          }}
                                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg border truncate text-left transition-all hover:translate-x-0.5 ${colClasses}`}
                                          title={`${ev.title} (${ev.category})`}
                                        >
                                          {ev.title}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            });

                            return [...emptyDays, ...activeDays];
                          })()}
                        </div>
                        
                        <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-widest font-bold text-zinc-400 mt-4 pt-4 border-t border-zinc-50">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-100 border border-blue-200 inline-block"></span> Réunion</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-purple-100 border border-purple-200 inline-block"></span> Conférence</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-200 inline-block"></span> Événement</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200 inline-block"></span> Visite</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-zinc-150 border border-zinc-200 inline-block"></span> Autre</span>
                        </div>
                      </div>

                      {/* Right Block: Sticky Post-it Notes Board (4 cols) */}
                      <div className="lg:col-span-4 space-y-6">
                        
                        {/* Note Creator Card */}
                        <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-4">
                          <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase font-sans">Créer un Post-it</h4>
                          <form onSubmit={handleAddAgendaNote} className="space-y-4">
                            <textarea
                              value={newNoteText}
                              onChange={(e) => setNewNoteText(e.target.value)}
                              placeholder={checkPermission("canModifyAgenda") ? "Écrivez une note de post-it ici..." : "Mode lecture seule actif pour la création."}
                              disabled={!checkPermission("canModifyAgenda")}
                              className={`w-full h-24 p-3.5 text-xs text-zinc-800 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none transition-all resize-none font-sans ${checkPermission("canModifyAgenda") ? "focus:border-primary focus:bg-white" : "cursor-not-allowed opacity-75"}`}
                            />
                            
                            {/* Color Selector */}
                            <div className="flex flex-col gap-2">
                              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest font-sans">Couleur du Post-it</span>
                              <div className="flex items-center gap-2">
                                {[
                                  { id: "yellow", bg: "bg-amber-100 border-amber-250", border: "border-amber-400" },
                                  { id: "blue", bg: "bg-sky-100 border-sky-250", border: "border-sky-450" },
                                  { id: "green", bg: "bg-emerald-100 border-emerald-250", border: "border-emerald-400" },
                                  { id: "pink", bg: "bg-rose-100 border-rose-250", border: "border-rose-400" },
                                  { id: "purple", bg: "bg-purple-100 border-purple-250", border: "border-purple-400" }
                                ].map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setNewNoteColor(c.id)}
                                    className={`
                                      w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center
                                      ${c.bg} 
                                      ${newNoteColor === c.id ? "scale-115 ring-2 ring-primary/45" : "hover:scale-105"}
                                    `}
                                  >
                                    {newNoteColor === c.id && <div className="w-1.5 h-1.5 rounded-full bg-zinc-950/40" />}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={!newNoteText.trim()}
                              className="w-full py-3 bg-zinc-950 hover:bg-zinc-850 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-none font-sans cursor-pointer"
                            >
                              Épingler la note +
                            </button>
                          </form>
                        </div>

                        {/* Sticky Notes Walls */}
                        <div className="space-y-4 max-h-[500px] overflow-y-auto scrollbar-none pr-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase font-sans">Notes Épinglées ({agendaNotes.length})</h4>
                          </div>

                          {agendaNotes.length === 0 ? (
                            <div className="p-8 border border-dashed border-zinc-200 rounded-3xl text-center text-zinc-400 py-12 space-y-1">
                              <p className="text-xs font-sans font-bold uppercase tracking-wide">Aucune note active</p>
                              <p className="text-[10px] font-sans">Créez votre premier post-it de brainstorming ci-dessus.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-4">
                              {agendaNotes.map((note, idx) => {
                                // Extract styles
                                let colorClass = "bg-amber-100/90 border-amber-200 text-amber-950 shadow-amber-100/30";
                                if (note.color === "blue") colorClass = "bg-sky-100/90 border-sky-205 text-sky-950 shadow-sky-100/30";
                                if (note.color === "green") colorClass = "bg-emerald-100/90 border-emerald-205 text-emerald-950 shadow-emerald-100/30";
                                if (note.color === "pink") colorClass = "bg-rose-100/90 border-rose-205 text-rose-950 shadow-rose-100/30";
                                if (note.color === "purple") colorClass = "bg-purple-100/90 border-purple-205 text-purple-950 shadow-purple-100/30";

                                // Subtle rotation index
                                const rotationDegrees = [
                                  "rotate-0", "rotate-[-1deg]", "rotate-[1deg]", "rotate-[-1.5deg]", "rotate-[1.5deg]"
                                ][idx % 5];

                                return (
                                  <div
                                    key={note.id}
                                    className={`
                                      p-5 rounded-2xl border ${colorClass} ${rotationDegrees} transition-transform hover:rotate-0 hover:scale-[1.01] shadow-md flex flex-col justify-between space-y-4 relative group
                                    `}
                                  >
                                    {/* Virtual Pin */}
                                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-zinc-800 opacity-60 drop-shadow flex items-center justify-center">
                                      <Pin size={16} />
                                    </div>

                                    {/* Note content */}
                                    <div className="pt-2">
                                      <p className="text-xs leading-relaxed whitespace-pre-wrap font-sans font-medium text-inherit">
                                        {note.text}
                                      </p>
                                    </div>

                                    {/* Footer with date-tracker & delete trigger */}
                                    <div className="flex justify-between items-end border-t border-black/5 pt-3">
                                      <span className="text-[8px] font-bold text-black/40 uppercase tracking-widest font-mono">
                                        {note.dateStr || "Enregistré"}
                                      </span>
                                      
                                      <button
                                        onClick={() => handleDeleteAgendaNote(note.id)}
                                        className="p-1 px-1.5 hover:bg-black/5 rounded text-black/40 hover:text-rose-700 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                        title="Retirer la note"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                      </div>

                    </div>

                    {/* MODAL 1: ADD EVENT MODAL */}
                    {showAddEventModalDate && (
                      <div className="fixed inset-0 bg-zinc-950/60 flex items-center justify-center z-[110] p-4 backdrop-blur-xs">
                        <div className="w-full max-w-md bg-white border border-zinc-100 rounded-3xl p-8 shadow-2xl relative animate-scale-up space-y-6">
                          <header className="border-b border-zinc-50 pb-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">AGENDA // REUNIONS</span>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-zinc-950 mt-1">Créer un événement</h3>
                            <p className="text-xs text-zinc-400 mt-1.5 font-sans">
                              Sélectionné: <strong className="text-zinc-650 font-mono font-bold">
                                {(() => {
                                  const parts = showAddEventModalDate.split("-");
                                  if (parts.length === 3) {
                                    return `${parts[2]}/${parts[1]}/${parts[0]}`;
                                  }
                                  return showAddEventModalDate;
                                })()}
                              </strong>
                            </p>
                          </header>

                          <form onSubmit={handleAddAgendaEvent} className="space-y-5">
                            {/* Title */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Titre de l'événement *</label>
                              <input
                                type="text"
                                required
                                value={eventForm.title}
                                onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="Ex: Réunion de coordination"
                                className="w-full p-3.5 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary text-xs font-sans font-semibold text-zinc-850"
                              />
                            </div>

                            {/* Category selector */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Catégorie *</label>
                              <select
                                value={eventForm.category}
                                onChange={(e) => setEventForm(prev => ({ ...prev, category: e.target.value }))}
                                className="w-full p-3.5 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary text-xs font-sans font-semibold text-zinc-850"
                              >
                                {["Réunion", "Conférence", "Événement", "Visite", "Autre"].map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>

                            {/* Importance selector */}
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Degré d'importance *</label>
                              <div className="grid grid-cols-3 gap-3">
                                {["Basse", "Moyenne", "Haute"].map(imp => (
                                  <button
                                    key={imp}
                                    type="button"
                                    onClick={() => setEventForm(prev => ({ ...prev, importance: imp }))}
                                    className={`
                                      py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer font-sans
                                      ${eventForm.importance === imp
                                        ? "bg-zinc-950 text-white border-zinc-950 font-bold"
                                        : "bg-white text-zinc-505 hover:bg-zinc-50 border-zinc-150"
                                      }
                                    `}
                                  >
                                    {imp}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Optional description */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Description facultative</label>
                              <textarea
                                value={eventForm.description}
                                onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Précisez l'ordre du jour, participants ou lieux..."
                                className="w-full h-24 p-3.5 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary text-xs font-sans leading-relaxed resize-none"
                              />
                            </div>

                            {/* Footer triggers */}
                            <div className="flex gap-3 border-t border-zinc-55 pt-5">
                              <button
                                type="button"
                                onClick={() => setShowAddEventModalDate(null)}
                                className="flex-1 py-4 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-zinc-800 transition-colors bg-transparent border border-transparent font-sans cursor-pointer"
                              >
                                Annuler
                              </button>
                              <button
                                type="submit"
                                className="flex-1 py-4 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-opacity-95 shadow-lg shadow-zinc-200 transition-all border-none font-sans cursor-pointer"
                              >
                                Enregistrer
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* MODAL 2: VIEW / INTERACTIVE EDIT & DELETE EVENT */}
                    {showEventDetails && (
                      <div className="fixed inset-0 bg-zinc-950/60 flex items-center justify-center z-[110] p-4 backdrop-blur-xs">
                        <div className="w-full max-w-md bg-white border border-zinc-100 rounded-3xl p-8 shadow-2xl relative animate-scale-up space-y-6">
                          
                          {/* Close button */}
                          <button 
                            onClick={() => setShowEventDetails(null)}
                            className="absolute top-6 right-6 p-2 text-zinc-350 hover:text-zinc-650 hover:bg-zinc-50 rounded-xl transition-all cursor-pointer"
                          >
                            <X size={16} />
                          </button>

                          <header className="border-b border-zinc-55 pb-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">AGENDA // DETAIL</span>
                            <h3 className="text-2xl font-black text-zinc-900 mt-1 font-sans">
                              {isEditingEvent ? "Modifier l'événement" : showEventDetails.title}
                            </h3>
                            <p className="text-[10px] font-mono text-zinc-400 font-black tracking-widest mt-1 uppercase">
                              Date : {(() => {
                                const parts = showEventDetails.date.split("-");
                                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : showEventDetails.date;
                              })()}
                            </p>
                          </header>

                          {isEditingEvent ? (
                            <form 
                              onSubmit={async (e) => {
                                e.preventDefault();
                                try {
                                  await updateDoc(doc(db, "agendaEvents", showEventDetails.id), {
                                    title: eventForm.title.trim() || "Sans titre",
                                    category: eventForm.category,
                                    importance: eventForm.importance,
                                    description: eventForm.description.trim()
                                  });
                                  setShowEventDetails(null);
                                } catch (err) {
                                  handleFirestoreError(err, OperationType.WRITE, `agendaEvents/${showEventDetails.id}`);
                                }
                              }} 
                              className="space-y-4"
                            >
                              {/* Title */}
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Titre de l'événement *</label>
                                <input
                                  type="text"
                                  required
                                  value={eventForm.title}
                                  onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                                  placeholder="Entrez le titre"
                                  className="w-full p-3 bg-zinc-50 border border-zinc-150 rounded-xl outline-none focus:border-primary text-xs font-sans font-semibold text-zinc-850"
                                />
                              </div>

                              {/* Category */}
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Catégorie *</label>
                                <select
                                  value={eventForm.category}
                                  onChange={(e) => setEventForm(prev => ({ ...prev, category: e.target.value }))}
                                  className="w-full p-3 bg-zinc-50 border border-zinc-150 rounded-xl outline-none focus:border-primary text-xs font-sans font-semibold text-zinc-850"
                                >
                                  {["Réunion", "Conférence", "Événement", "Visite", "Autre"].map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Importance */}
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Importance *</label>
                                <select
                                  value={eventForm.importance}
                                  onChange={(e) => setEventForm(prev => ({ ...prev, importance: e.target.value }))}
                                  className="w-full p-3 bg-zinc-50 border border-zinc-150 rounded-xl outline-none focus:border-primary text-xs font-sans font-semibold text-zinc-850"
                                >
                                  {["Basse", "Moyenne", "Haute"].map(imp => (
                                    <option key={imp} value={imp}>{imp}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Description */}
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Description</label>
                                <textarea
                                  value={eventForm.description}
                                  onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                                  placeholder="Détails additionnels..."
                                  className="w-full h-24 p-3 bg-zinc-50 border border-zinc-150 rounded-xl outline-none focus:border-primary text-xs font-sans leading-relaxed resize-none"
                                />
                              </div>

                              <div className="flex gap-2 border-t border-zinc-55 pt-4">
                                <button
                                  type="button"
                                  onClick={() => setIsEditingEvent(false)}
                                  className="flex-1 py-2.5 text-zinc-450 font-bold uppercase text-[10px] tracking-widest hover:text-zinc-805 transition-colors bg-transparent border border-transparent font-sans cursor-pointer"
                                >
                                  Retour
                                </button>
                                <button
                                  type="submit"
                                  className="flex-1 py-2.5 bg-primary hover:bg-opacity-90 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-sm transition-all border-none font-sans cursor-pointer"
                                >
                                  Sauvegarder
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="space-y-6">
                              <div className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                  {/* Category Badge */}
                                  <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-zinc-50 border border-zinc-150 rounded-xl font-sans text-zinc-600">
                                    {showEventDetails.category}
                                  </span>

                                  {/* Importance Badge */}
                                  <span className={`
                                    px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border rounded-xl font-sans
                                    ${showEventDetails.importance === "Haute" 
                                      ? "bg-rose-50 text-rose-600 border-rose-100" 
                                      : showEventDetails.importance === "Moyenne" 
                                        ? "bg-amber-50 text-amber-600 border-amber-150" 
                                        : "bg-blue-50 text-blue-600 border-blue-100"
                                    }
                                  `}>
                                    Priorité: {showEventDetails.importance || "Moyenne"}
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <h5 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 font-sans">Description contextuelle</h5>
                                  <div className="bg-zinc-50/50 p-4 border border-zinc-100 rounded-2xl min-h-[60px]">
                                    <p className="text-xs text-zinc-700 leading-relaxed font-sans font-medium whitespace-pre-wrap">
                                      {showEventDetails.description || "Aucune description fournie pour cet événement."}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {deleteConfirmEvent ? (
                                <div className="animate-fade-in bg-rose-50 border border-rose-100 rounded-2xl p-4 space-y-3">
                                  <p className="text-xs font-bold text-rose-800 font-sans uppercase">Êtes-vous sûr de vouloir supprimer cet événement ?</p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleDeleteAgendaEvent(showEventDetails.id)}
                                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-750 text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer"
                                    >
                                      Oui, Supprimer
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmEvent(false)}
                                      className="px-3 py-1.5 bg-zinc-105 text-zinc-605 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <footer className="flex gap-2 border-t border-zinc-55 pt-5 justify-between">
                                  <button
                                    onClick={() => setDeleteConfirmEvent(true)}
                                    className="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-105 text-rose-600 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    title="Supprimer l'événement"
                                  >
                                    <Trash2 size={16} />
                                    <span className="text-[10px] font-black uppercase font-sans">Supprimer</span>
                                  </button>
                                  
                                  <button
                                    onClick={() => {
                                      // Pre-fill fields for editing
                                      setEventForm({
                                        title: showEventDetails.title || "",
                                        category: showEventDetails.category || "Réunion",
                                        importance: showEventDetails.importance || "Moyenne",
                                        description: showEventDetails.description || ""
                                      });
                                      setIsEditingEvent(true);
                                    }}
                                    className="px-6 py-3 bg-zinc-950 hover:bg-zinc-850 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all font-sans cursor-pointer"
                                  >
                                    Modifier les infos
                                  </button>
                                </footer>
                              )}
                            </div>
                          )}

                        </div>
                      </div>
                    )}

                  </div>
                )}

                {activeTab === "accounts" && checkPermission("canViewAccounts") && (
                  <div className="space-y-12 animate-fade-in pb-16 font-sans">
                    {/* Header */}
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-2 border-b border-zinc-100">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary block mb-2 font-mono">HABILITATIONS ET SÉCURITÉ DE L'ÉQUIPE // CRISTAL CLAIR</span>
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase text-zinc-950">Gestion des Comptes</h2>
                        <p className="text-zinc-500 text-sm mt-1">Visualisez et configurez les niveaux d'accès des membres du comité de soutien</p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-100 font-mono text-xs text-zinc-650">
                        <div className="flex items-center gap-2">
                          <Activity size={14} className="text-primary animate-pulse" />
                          <span className="font-bold uppercase tracking-wider text-[10px] text-zinc-400">Rôles actifs :</span>
                          <span className="text-zinc-800 font-bold">{systemUsers.length} comptes</span>
                        </div>
                      </div>
                    </header>

                    {/* Main Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      
                      {/* Left Block: Teammates lists (8 cols) */}
                      <div className="lg:col-span-8 bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-50 pb-5">
                          <div>
                            <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase mb-1">Membres de l'Équipe</h4>
                            <p className="text-xs text-zinc-500">Donnez l'accès aux différents modules de l'espace de travail</p>
                          </div>
                          
                          {/* Search box */}
                          <div className="relative w-full sm:w-64">
                            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                              type="text"
                              placeholder="Rechercher par nom, email..."
                              value={userProfileSearch}
                              onChange={(e) => setUserProfileSearch(e.target.value)}
                              className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-xs outline-none focus:border-primary focus:bg-white transition-all font-semibold"
                            />
                          </div>
                        </div>

                        {/* List rendering */}
                        {(() => {
                          const filteredUsers = systemUsers.filter(u => {
                            const searchLower = userProfileSearch.toLowerCase().trim();
                            if (!searchLower) return true;
                            const nameMatch = (u.displayName || "").toLowerCase().includes(searchLower);
                            const emailMatch = (u.email || "").toLowerCase().includes(searchLower);
                            return nameMatch || emailMatch;
                          });

                          if (filteredUsers.length === 0) {
                            return (
                              <div className="p-12 border border-dashed border-zinc-200 rounded-3xl text-center text-zinc-400 py-16 space-y-2">
                                <Users size={32} className="mx-auto text-zinc-300 mb-1" />
                                <p className="text-sm font-bold uppercase tracking-wide">Aucun membre trouvé</p>
                                <p className="text-xs">Modifiez vos critères de recherche ou invitez un collègue.</p>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-4">
                              {filteredUsers.map((u) => {
                                // Compute Name Initials
                                const initials = (u.displayName || u.email || "M")
                                  .split(" ")
                                  .map((n: string) => n[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase();

                                // Construct permissions list for visual status pills
                                const groupPerms = [
                                  { label: "Acc", active: !!u.canModifyHome },
                                  { label: "Prog", active: !!u.canModifyProgramme },
                                  { label: "Conf", active: !!u.canModifyConferences },
                                  { label: "Éq", active: !!u.canModifyEquipe },
                                  { label: "Trés(L)", active: !!u.canViewTresorerie },
                                  { label: "Trés(E)", active: !!u.canModifyTresorerie },
                                  { label: "Sout(L)", active: !!u.canViewSoutiens },
                                  { label: "Sout(E)", active: !!u.canModifySoutiens },
                                  { label: "Agd(L)", active: !!u.canViewAgenda },
                                  { label: "Agd(E)", active: !!u.canModifyAgenda },
                                  { label: "Habil", active: !!u.canViewAccounts }
                                ];

                                const isSovereign = u.email === "admin@fgses.mun";

                                return (
                                  <div 
                                    key={u.id}
                                    className="p-5 border border-zinc-100 bg-zinc-50/20 rounded-2xl hover:bg-zinc-50/50 transition-all shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
                                  >
                                    {/* Identity */}
                                    <div className="flex items-center gap-4">
                                      <div className="w-12 h-12 rounded-full bg-zinc-950 text-white font-black text-sm flex items-center justify-center tracking-tighter shadow-sm">
                                        {initials}
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <h4 className="text-sm font-bold text-zinc-950">{u.displayName || "Sans nom"}</h4>
                                          <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border ${
                                            u.role === "admin" || isSovereign
                                              ? "bg-primary/10 text-primary border-primary/20"
                                              : "bg-zinc-105 text-zinc-505 border-zinc-200"
                                          }`}>
                                            {isSovereign ? "SOUVERAIN" : (u.role === "admin" ? "ADMIN" : "MEMBRE")}
                                          </span>
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-0.5">{u.email}</p>
                                        <p className="text-[9px] text-zinc-400 font-mono uppercase tracking-wider mt-1.5">
                                          Créé le : {u.createdAt ? (typeof u.createdAt.toDate === "function" ? u.createdAt.toDate().toLocaleDateString("fr-FR") : new Date(u.createdAt.seconds * 1000).toLocaleDateString("fr-FR")) : "Inconnu"}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Actions & Permissions */}
                                    <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-start sm:items-center md:items-end lg:items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                                      <div className="flex flex-wrap gap-1 max-w-[280px] md:justify-end">
                                        {isSovereign ? (
                                          <span className="px-2 py-1 text-[8px] font-black tracking-widest uppercase rounded bg-zinc-955 text-amber-500 border border-amber-500/20 shadow-xs">
                                            Rôle Souverain : TOUS LES ACCÈS SONT ACTIFS
                                          </span>
                                        ) : (
                                          groupPerms.map((perm, pIdx) => (
                                            <span 
                                              key={pIdx}
                                              className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase tracking-wide border ${
                                                perm.active 
                                                  ? "bg-emerald-50 text-emerald-700 border-emerald-205" 
                                                  : "bg-zinc-100/50 text-zinc-350 border-zinc-200/30"
                                              }`}
                                              title={perm.active ? `Habilitation active: ${perm.label}` : `Refusé: ${perm.label}`}
                                            >
                                              {perm.label}
                                            </span>
                                          ))
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 self-end sm:self-auto">
                                        <button
                                          onClick={() => {
                                            setSelectedUserForEdit(u);
                                            setEditingPermissions({
                                              canModifyHome: !!u.canModifyHome,
                                              canModifyProgramme: !!u.canModifyProgramme,
                                              canModifyConferences: !!u.canModifyConferences,
                                              canModifyEquipe: !!u.canModifyEquipe,
                                              canViewSoutiens: !!u.canViewSoutiens,
                                              canModifySoutiens: !!u.canModifySoutiens,
                                              canViewTresorerie: !!u.canViewTresorerie,
                                              canModifyTresorerie: !!u.canModifyTresorerie,
                                              canViewAgenda: !!u.canViewAgenda,
                                              canModifyAgenda: !!u.canModifyAgenda,
                                              canViewAccounts: !!u.canViewAccounts,
                                              canModifyAccounts: !!u.canModifyAccounts,
                                            });
                                          }}
                                          disabled={isSovereign || !checkPermission("canModifyAccounts")}
                                          className="px-3 py-1.5 bg-white hover:bg-zinc-55 border border-zinc-200 text-zinc-700 hover:text-zinc-950 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 cursor-pointer"
                                        >
                                          Gérer
                                        </button>
                                        
                                        <button
                                          onClick={() => {
                                            setUserToDelete(u);
                                          }}
                                          disabled={isSovereign || u.id === user?.uid || !checkPermission("canModifyAccounts")}
                                          className="p-1.5 border border-zinc-200 hover:border-rose-200 text-zinc-400 hover:text-rose-600 bg-white hover:bg-rose-50 rounded-xl transition-all disabled:opacity-40 cursor-pointer"
                                          title="Révoquer le compte"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Right Block: Teammates creation form (4 cols) */}
                      <div className="lg:col-span-4 space-y-6">
                        <form onSubmit={handleCreateTeammateAccount} className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-5">
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary font-mono block">WORKSPACE // ADMIN</span>
                            <h4 className="text-lg font-black text-zinc-950 tracking-tight flex items-center gap-1.5 mt-0.5">
                              Créer un collaborateur
                            </h4>
                            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                              Créez directement un compte pour les membres de l'équipe sans qu'ils aient besoin de s'inscrire eux-mêmes au préalable.
                            </p>
                          </div>

                          {/* Message boxes */}
                          {creationError && (
                            <div className="bg-rose-50 border border-rose-100/50 p-3.5 rounded-xl flex items-start gap-2.5 text-rose-705 text-xs">
                              <AlertCircle size={15} className="shrink-0 mt-0.5" />
                              <span>{creationError}</span>
                            </div>
                          )}

                          {creationSuccess && (
                            <div className="bg-emerald-50 border border-emerald-100/50 p-3.5 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs animate-fade-in">
                              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                              <span>{creationSuccess}</span>
                            </div>
                          )}

                          {/* Inputs */}
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block pb-0.5">Nom d'affichage</label>
                              <div className="relative">
                                <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                  type="text"
                                  required
                                  value={newTeammateName}
                                  onChange={(e) => setNewTeammateName(e.target.value)}
                                  placeholder="Ex: Jean Dupont"
                                  className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-100 rounded-xl text-xs outline-none focus:border-primary focus:bg-white transition-all font-semibold text-zinc-805"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block pb-0.5">Adresse e-mail</label>
                              <div className="relative">
                                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                  type="email"
                                  required
                                  value={newTeammateEmail}
                                  onChange={(e) => setNewTeammateEmail(e.target.value)}
                                  placeholder="Ex: j.dupont@fgses.mun"
                                  className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-100 rounded-xl text-xs outline-none focus:border-primary focus:bg-white transition-all font-semibold text-zinc-805"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block pb-0.5">Mot de passe de départ</label>
                              <div className="relative">
                                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                  type="text"
                                  required
                                  value={newTeammatePassword}
                                  onChange={(e) => setNewTeammatePassword(e.target.value)}
                                  placeholder="Saisissez un mot de passe (min 6 char)"
                                  className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-100 rounded-xl text-xs outline-none focus:border-primary focus:bg-white transition-all font-mono font-semibold text-zinc-805"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block pb-0.5">Classification du Profil</label>
                              <select
                                value={newTeammateRole}
                                onChange={(e) => setNewTeammateRole(e.target.value)}
                                className="w-full p-2.5 bg-zinc-50 border border-zinc-100 rounded-xl outline-none focus:border-primary text-xs font-semibold text-zinc-805"
                              >
                                <option value="user">Membre Standard (Habilitations sélectives)</option>
                                <option value="admin">Administrateur Système (Full-accès souverain)</option>
                              </select>
                            </div>

                            {/* Permissions Selector Checkboxes */}
                            <div className="space-y-2 pt-2 border-t border-zinc-105">
                              <div className="flex justify-between items-center pb-0.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-450 block">Habilitations d'Accès</label>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewTeammatePermissions({
                                        canModifyHome: true,
                                        canModifyProgramme: true,
                                        canModifyConferences: true,
                                        canModifyEquipe: true,
                                        canViewSoutiens: true,
                                        canModifySoutiens: true,
                                        canViewTresorerie: true,
                                        canModifyTresorerie: true,
                                        canViewAgenda: true,
                                        canModifyAgenda: true,
                                        canViewAccounts: true,
                                        canModifyAccounts: true,
                                      });
                                    }}
                                    className="text-[9px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                                  >
                                    Tout cocher
                                  </button>
                                  <span className="text-zinc-300 text-[10px] font-semibold">|</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewTeammatePermissions({
                                        canModifyHome: false,
                                        canModifyProgramme: false,
                                        canModifyConferences: false,
                                        canModifyEquipe: false,
                                        canViewSoutiens: false,
                                        canModifySoutiens: false,
                                        canViewTresorerie: false,
                                        canModifyTresorerie: false,
                                        canViewAgenda: false,
                                        canModifyAgenda: false,
                                        canViewAccounts: false,
                                        canModifyAccounts: false,
                                      });
                                    }}
                                    className="text-[9px] font-black uppercase tracking-wider text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                                  >
                                    Tout décocher
                                  </button>
                                </div>
                              </div>

                              <div className="bg-zinc-50/50 p-3 bg-zinc-50 border border-zinc-100 rounded-2xl grid grid-cols-1 gap-2.5 max-h-56 overflow-y-auto scrollbar-none">
                                {[
                                  { key: "canModifyHome", label: "Modifier Accueil [Home]" },
                                  { key: "canModifyProgramme", label: "Modifier Programme [Contenu]" },
                                  { key: "canModifyConferences", label: "Modifier Conférences [Médias]" },
                                  { key: "canModifyEquipe", label: "Modifier Membres de l'Équipe" },
                                  { key: "canViewSoutiens", label: "Lecture Liste des Soutiens" },
                                  { key: "canModifySoutiens", label: "Édition/Gestion des Soutiens" },
                                  { key: "canViewTresorerie", label: "Lecture Comptabilité/Trésor" },
                                  { key: "canModifyTresorerie", label: "Édition/Gestion de la Trésor" },
                                  { key: "canViewAgenda", label: "Lecture de l'Agenda / Notes" },
                                  { key: "canModifyAgenda", label: "Édition/Gestion de l'Agenda" },
                                  { key: "canViewAccounts", label: "Lecture des Habilitations" },
                                  { key: "canModifyAccounts", label: "Édition/Gestion d'Accès" }
                                ].map((permSec) => (
                                  <label 
                                    key={permSec.key}
                                    className="flex items-center gap-2.5 cursor-pointer select-none group"
                                  >
                                    <input 
                                      type="checkbox"
                                      checked={!!(newTeammatePermissions as any)[permSec.key]}
                                      onChange={(e) => {
                                        setNewTeammatePermissions({
                                          ...newTeammatePermissions,
                                          [permSec.key]: e.target.checked
                                        });
                                      }}
                                      className="rounded border-zinc-300 text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-zinc-650 group-hover:text-zinc-900 transition-colors">
                                      {permSec.label}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={isCreatingTeammate}
                            className="w-full py-3 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-opacity-95 shadow-sm hover:shadow transition-all border-none font-sans cursor-pointer flex items-center justify-center gap-2"
                          >
                            {isCreatingTeammate ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                <span>Création en cours...</span>
                              </>
                            ) : (
                              <>
                                <Plus size={14} />
                                <span>Créer le compte</span>
                              </>
                            )}
                          </button>
                        </form>
                      </div>

                    </div>

                    {/* Modal: Direct Permissions Modifier Panel */}
                    {selectedUserForEdit && (
                      <div className="fixed inset-0 bg-zinc-950/60 flex items-center justify-center z-[110] p-4 backdrop-blur-xs font-sans">
                        <div className="w-full max-w-lg bg-white border border-zinc-100 rounded-3xl p-8 shadow-2xl relative animate-scale-up space-y-6 max-h-[90vh] overflow-y-auto scrollbar-none">
                          <header className="border-b border-zinc-100 pb-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary block mb-1">HABILITATIONS // MEMBRE</span>
                            <h3 className="text-2xl font-black text-zinc-900">
                              Modifier la fiche membre
                            </h3>
                            <p className="text-xs text-zinc-400 font-mono tracking-wide mt-1">
                              Adresse e-mail : {selectedUserForEdit.email}
                            </p>
                          </header>

                          <div className="space-y-5">
                            {/* Display Name input */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block pb-1">Nom ou Identifiant d'affichage</label>
                              <input
                                type="text"
                                value={selectedUserForEdit.displayName || ""}
                                onChange={(e) => {
                                  setSelectedUserForEdit({ ...selectedUserForEdit, displayName: e.target.value });
                                }}
                                className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl outline-none focus:border-primary text-xs font-semibold text-zinc-850"
                                placeholder="..."
                              />
                            </div>

                            {/* Role Select input */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block pb-1">Classification du Profil</label>
                              <select
                                value={selectedUserForEdit.role || "user"}
                                onChange={(e) => {
                                  setSelectedUserForEdit({ ...selectedUserForEdit, role: e.target.value });
                                }}
                                className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl outline-none focus:border-primary text-xs font-semibold text-zinc-850"
                              >
                                <option value="user">Membre Standard (Habilitations sélectives)</option>
                                <option value="admin">Administrateur Système (Full-accès souverain)</option>
                              </select>
                            </div>

                            {/* Permissions Checkboxes */}
                            <div className="space-y-3 pt-1">
                              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Autorisations d'Accès de l'Espace de travail</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-zinc-50 p-4 border border-zinc-100 rounded-2xl">
                                {[
                                  { key: "canModifyHome", label: "Modifier Accueil [Home]" },
                                  { key: "canModifyProgramme", label: "Modifier Programme [Contenu]" },
                                  { key: "canModifyConferences", label: "Modifier Conférences [Médias]" },
                                  { key: "canModifyEquipe", label: "Modifier Membres de l'Équipe" },
                                  { key: "canViewSoutiens", label: "Lecture Liste des Soutiens" },
                                  { key: "canModifySoutiens", label: "Édition/Gestion des Soutiens" },
                                  { key: "canViewTresorerie", label: "Lecture Comptabilité/Trésor" },
                                  { key: "canModifyTresorerie", label: "Édition/Gestion de la Trésor" },
                                  { key: "canViewAgenda", label: "Lecture de l'Agenda / Notes" },
                                  { key: "canModifyAgenda", label: "Édition/Gestion de l'Agenda" },
                                  { key: "canViewAccounts", label: "Lecture des Permissions" },
                                  { key: "canModifyAccounts", label: "Édition/Gestion de d'Accès" }
                                ].map((permSec) => (
                                  <label 
                                    key={permSec.key}
                                    className="flex items-center gap-2.5 p-1 cursor-pointer select-none group"
                                  >
                                    <input 
                                      type="checkbox"
                                      checked={!!editingPermissions[permSec.key]}
                                      onChange={(e) => {
                                        setEditingPermissions({
                                          ...editingPermissions,
                                          [permSec.key]: e.target.checked
                                        });
                                      }}
                                      className="rounded border-zinc-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                                    />
                                    <span className="text-[11px] font-bold text-zinc-700 group-hover:text-zinc-955 transition-colors">
                                      {permSec.label}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Control button actions */}
                            <div className="flex gap-3 border-t border-zinc-100 pt-5">
                              <button
                                type="button"
                                onClick={() => setSelectedUserForEdit(null)}
                                className="flex-1 py-4 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-zinc-800 transition-colors bg-transparent border border-transparent font-sans cursor-pointer"
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await handleUpdateTeammatePermissions(
                                    selectedUserForEdit.id,
                                    editingPermissions,
                                    selectedUserForEdit.displayName,
                                    selectedUserForEdit.role
                                  );
                                }}
                                disabled={isUpdatingUserPermissions}
                                className="flex-1 py-4 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-opacity-95 shadow-lg shadow-zinc-250 transition-all border-none font-sans cursor-pointer flex items-center justify-center gap-2"
                              >
                                {isUpdatingUserPermissions ? (
                                  <>
                                    <Loader2 size={12} className="animate-spin" />
                                    <span>Mise à jour...</span>
                                  </>
                                ) : (
                                  <span>Sauvegarder</span>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Modal: Direct Delete Confirmation Panel */}
                    {userToDelete && (
                      <div className="fixed inset-0 bg-zinc-950/60 flex items-center justify-center z-[110] p-4 backdrop-blur-xs font-sans">
                        <div className="w-full max-w-md bg-white border border-zinc-100 rounded-3xl p-8 shadow-2xl relative animate-scale-up space-y-6">
                          <header className="border-b border-zinc-100 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
                              <Trash2 size={24} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-600 block mb-1 font-mono">DANGER // RÉVOCATION</span>
                            <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">
                              Supprimer le compte ?
                            </h3>
                            <p className="text-xs text-zinc-500 mt-2">
                              Cette action supprimera la fiche d'accès et toutes les permissions de campagne associées à ce collaborateur.
                            </p>
                          </header>

                          <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 text-center">
                            <h4 className="text-sm font-bold text-zinc-950">{userToDelete.displayName || "Sans nom"}</h4>
                            <p className="text-xs text-zinc-500 mt-0.5">{userToDelete.email}</p>
                          </div>

                          <div className="bg-rose-50/50 rounded-2xl p-4 border border-rose-100/30 flex items-start gap-3">
                            <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-rose-800 leading-relaxed font-semibold">
                              L'utilisateur ne disposera plus d'aucun droit d'accès aux modules de gestion de l'espace de travail électoral.
                            </p>
                          </div>

                          <div className="flex gap-3 border-t border-zinc-100 pt-5">
                            <button
                              type="button"
                              onClick={() => setUserToDelete(null)}
                              disabled={isDeletingTeammate}
                              className="flex-1 py-3 text-zinc-450 hover:text-zinc-805 font-bold uppercase text-[10px] tracking-widest transition-colors bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl font-sans cursor-pointer disabled:opacity-55"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await handleDeleteTeammate(userToDelete.id);
                              }}
                              disabled={isDeletingTeammate}
                              className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all border-none font-sans cursor-pointer flex items-center justify-center gap-2"
                            >
                              {isDeletingTeammate ? (
                                <>
                                  <Loader2 size={12} className="animate-spin" />
                                  <span>Suppression...</span>
                                </>
                              ) : (
                                <span>Supprimer</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Admin Add Modals */}
      <AnimatePresence>
        {showAddForm !== "none" && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddForm("none")}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white p-10 rounded-2xl shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-8 uppercase tracking-tighter">Ajouter : {showAddForm}</h2>
              <form onSubmit={handleAddItem} className="space-y-4">
                {showAddForm === "program" && (
                  <>
                    <input required placeholder="Titre" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, title: e.target.value})} />
                    <textarea required placeholder="Description" rows={4} className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, description: e.target.value})} />
                    <input placeholder="Lien image Drive (optionnel)" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, imageUrl: e.target.value})} />
                  </>
                )}
                {showAddForm === "conference" && (
                  <>
                    <input required placeholder="Titre" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, title: e.target.value})} />
                    <textarea required placeholder="Description" rows={3} className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, description: e.target.value})} />
                    <input required placeholder="Lien Logo Drive" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, logoUrl: e.target.value})} />
                  </>
                )}
                {showAddForm === "team" && (
                  <>
                    <input required placeholder="Nom Complet" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, name: e.target.value})} />
                    <input required placeholder="Rôle" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, role: e.target.value})} />
                    <textarea placeholder="Description optionnelle" rows={2} className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, description: e.target.value})} />
                    <input required placeholder="Lien Photo de profil Drive" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, photoUrl: e.target.value})} />
                    <input required placeholder="Contact (Email/Tel)" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, contact: e.target.value})} />
                  </>
                )}
                {showAddForm === "homepage" && (
                  <>
                    <input required placeholder="Titre de l'article" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, title: e.target.value})} />
                    <textarea required placeholder="Introduction / Résumé" rows={3} className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, description: e.target.value})} />
                    <input placeholder="Lien Image Drive (optionnel)" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, imageUrl: e.target.value})} />
                    <input placeholder="Auteur / Signature (ex: Mehdi Loubani)" className="w-full p-4 bg-zinc-50 rounded-lg outline-none" onChange={e => setFormData({...formData, signature: e.target.value})} />
                  </>
                )}
                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setShowAddForm("none")} className="flex-1 py-4 text-zinc-400 font-bold uppercase text-[10px] tracking-widest">Annuler</button>
                  <button type="submit" disabled={formLoading} className="flex-1 py-4 bg-primary text-white rounded-lg font-bold uppercase text-[10px] tracking-widest disabled:opacity-50">
                    {formLoading ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Treasury: Ajouter de l'argent (Income) Modal */}
      <AnimatePresence>
        {showAddIncomeModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 text-left">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddIncomeModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white p-10 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh] space-y-8 animate-fade-in"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">TRESORERIE // ENREGISTRER</span>
                <h3 className="text-3xl font-black uppercase tracking-tight text-zinc-950 mt-1">Ajouter de l'argent</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Ajouter une nouvelle recette ou versement de sponsor</p>
              </div>

              <form onSubmit={handleSaveIncome} className="space-y-5">
                {/* Montant */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Montant du versement (DH) *</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    placeholder="ex: 12500" 
                    value={incomeForm.amount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val.includes("-")) return;
                      setIncomeForm({...incomeForm, amount: val});
                    }}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                {/* Source */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Source du revenu / Payeur *</label>
                  <input 
                    required 
                    placeholder="ex: Bureau du Secrétariat, Partenaire UM6P..." 
                    value={incomeForm.source}
                    onChange={e => setIncomeForm({...incomeForm, source: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Catégorie *</label>
                    <select
                      value={incomeForm.category}
                      onChange={e => setIncomeForm({...incomeForm, category: e.target.value})}
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm font-bold"
                    >
                      <option value="Sponsoring">Sponsoring</option>
                      <option value="Cotisation">Cotisation</option>
                      <option value="Subvention">Subvention</option>
                      <option value="Partenariat">Partenariat</option>
                      <option value="Billetterie">Billetterie</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Date *</label>
                    <input 
                      required 
                      type="datetime-local" 
                      value={incomeForm.date}
                      onChange={e => setIncomeForm({...incomeForm, date: e.target.value})}
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Motif / Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Description / Motif détaillé *</label>
                  <textarea 
                    required 
                    placeholder="ex: Contrat de sponsoring Or - Campagne d'ouverture de l'édition 2026..." 
                    rows={3} 
                    value={incomeForm.description}
                    onChange={e => setIncomeForm({...incomeForm, description: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                {/* Facture Attachment URL or File dropping zone */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Lien du justificatif (Optionnel)</label>
                  <input 
                    placeholder="Saisissez ou collez un lien Google Drive" 
                    value={incomeForm.attachmentUrl}
                    onChange={e => setIncomeForm({...incomeForm, attachmentUrl: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-xs font-mono"
                  />
                  
                  {/* Dropzone visual selector */}
                  <div 
                    className="border-2 border-dashed border-zinc-200 p-6 rounded-2xl text-center hover:border-primary hover:bg-zinc-50/50 transition-all cursor-pointer"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) {
                        setIncomeForm({
                          ...incomeForm,
                          attachmentUrl: `https://drive.google.com/file/d/simulated-${Date.now()}`
                        });
                      }
                    }}
                  >
                    <Upload className="mx-auto text-zinc-400 mb-2" size={20} />
                    <p className="text-[11px] text-zinc-500 font-medium font-sans">Glissez et déposez un fichier ici ou cliquez pour simuler l'import</p>
                    <p className="text-[9px] text-zinc-400 font-mono mt-1">Accepte les PDF, JPG ou PNG comptables</p>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => setShowAddIncomeModal(false)} 
                    className="flex-1 py-4 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-zinc-900 transition-colors bg-transparent border border-transparent"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    disabled={financeSubmitting} 
                    className="flex-1 py-4 bg-primary text-white rounded-xl font-bold uppercase text-[10px] tracking-widest disabled:opacity-50 hover:bg-opacity-95 shadow-lg shadow-zinc-200 transition-all border-none cursor-pointer"
                  >
                    {financeSubmitting ? "Enregistrement..." : "Confirmer"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Treasury: Retirer de l'argent (Expense) Modal */}
      <AnimatePresence>
        {showAddExpenseModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 text-left">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddExpenseModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white p-10 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh] space-y-8 animate-fade-in"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">TRESORERIE // RETRAIT</span>
                <h3 className="text-3xl font-black uppercase tracking-tight text-zinc-950 mt-1">Retirer de l'argent</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Autoriser ou enregistrer un décaissement de fonds</p>
              </div>

              <form onSubmit={handleSaveExpense} className="space-y-5">
                {/* Montant */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-rose-500 block">Montant de la dépense (DH) *</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    placeholder="ex: 2300" 
                    value={expenseForm.amount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val.includes("-")) return;
                      setExpenseForm({...expenseForm, amount: val});
                    }}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-rose-400 focus:bg-white text-sm"
                  />
                </div>

                {/* Responsable */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Responsable de l'achat *</label>
                  <input 
                    required 
                    placeholder="ex: Soraya Meziane, Équipe logistique..." 
                    value={expenseForm.responsible}
                    onChange={e => setExpenseForm({...expenseForm, responsible: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Catégorie d'usage *</label>
                    <select
                      value={expenseForm.category}
                      onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm font-bold"
                    >
                      <option value="Événement">Événement</option>
                      <option value="Communication">Communication</option>
                      <option value="Logistique">Logistique</option>
                      <option value="Restauration">Restauration</option>
                      <option value="Transport">Transport</option>
                      <option value="Impression">Impression</option>
                      <option value="Remboursement">Remboursement</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>

                  {/* Priority level */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Niveau de Priorité *</label>
                    <select
                      value={expenseForm.priority}
                      onChange={e => setExpenseForm({...expenseForm, priority: e.target.value})}
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm font-bold"
                    >
                      <option value="Basse">Priorité Basse</option>
                      <option value="Moyenne">Priorité Moyenne</option>
                      <option value="Haute">Priorité Haute</option>
                    </select>
                  </div>
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Date *</label>
                  <input 
                    required 
                    type="datetime-local" 
                    value={expenseForm.date}
                    onChange={e => setExpenseForm({...expenseForm, date: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-xs font-bold"
                  />
                </div>

                {/* Motif / Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Motif détaillé *</label>
                  <textarea 
                    required 
                    placeholder="ex: Commande de 50 badges nominatifs et 100 étiquettes d'orateur..." 
                    rows={3} 
                    value={expenseForm.description}
                    onChange={e => setExpenseForm({...expenseForm, description: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                {/* Attachment File dropzone or input link */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Lien du justificatif Drive (Optionnel)</label>
                  <input 
                    placeholder="Saisissez ou collez de Justificatif / Facture" 
                    value={expenseForm.attachmentUrl}
                    onChange={e => setExpenseForm({...expenseForm, attachmentUrl: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-xs font-mono"
                  />

                  {/* Dropzone visual */}
                  <div 
                    className="border-2 border-dashed border-zinc-200 p-6 rounded-2xl text-center hover:border-rose-400 hover:bg-zinc-50/50 transition-all cursor-pointer"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) {
                        setExpenseForm({
                          ...expenseForm,
                          attachmentUrl: `https://drive.google.com/file/d/simulated-expense-${Date.now()}`
                        });
                      }
                    }}
                  >
                    <Upload className="mx-auto text-zinc-400 mb-2" size={20} />
                    <p className="text-[11px] text-zinc-500 font-medium font-sans">Glissez et déposez un reçu ici ou cliquez pour simuler l'import</p>
                    <p className="text-[9px] text-zinc-400 font-mono mt-1">Génère un lien de facture d'achat simulé</p>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => setShowAddExpenseModal(false)} 
                    className="flex-1 py-4 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-zinc-900 transition-colors bg-transparent border border-transparent"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    disabled={financeSubmitting} 
                    className="flex-1 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest disabled:opacity-50 shadow-lg shadow-zinc-200 transition-all border-none cursor-pointer"
                  >
                    {financeSubmitting ? "Enregistrement..." : "Autoriser"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Treasury: Ajouter un Objectif Modal */}
      <AnimatePresence>
        {showAddGoalModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 text-left">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddGoalModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white p-10 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh] space-y-8 animate-fade-in z-[120]"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">TRESORERIE // OBJECTIF</span>
                <h3 className="text-3xl font-black uppercase tracking-tight text-zinc-950 mt-1">Créer un objectif</h3>
                <p className="text-xs text-zinc-400 mt-0.5 font-sans">Définissez une nouvelle cible de trésorerie nette pour le projet.</p>
              </div>

              <form onSubmit={handleSaveGoal} className="space-y-5">
                {/* Titre */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Titre de l'objectif *</label>
                  <input 
                    required 
                    placeholder="ex: Financement principal des délégations" 
                    value={goalForm.title}
                    onChange={e => setGoalForm({...goalForm, title: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                {/* Cible de financement */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Montant cible (DH) *</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    placeholder="ex: 25000" 
                    value={goalForm.amount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val.includes("-")) return;
                      setGoalForm({...goalForm, amount: val});
                    }}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Description de l'objectif</label>
                  <textarea 
                    placeholder="ex: Cap nécessaire pour sécuriser les réservations d'amphithéâtre et cocktail..." 
                    rows={3} 
                    value={goalForm.description}
                    onChange={e => setGoalForm({...goalForm, description: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => setShowAddGoalModal(false)} 
                    className="flex-1 py-4 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-zinc-900 transition-colors bg-transparent border border-transparent font-sans"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-4 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-zinc-200 transition-all border-none cursor-pointer font-sans"
                  >
                    Confirmer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Treasury: Modifier un Objectif Modal */}
      <AnimatePresence>
        {showEditGoalModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 text-left">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditGoalModal(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white p-10 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh] space-y-8 animate-fade-in z-[120]"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">TRESORERIE // APPRECIATION</span>
                <h3 className="text-3xl font-black uppercase tracking-tight text-zinc-950 mt-1 font-sans">Modifier l'objectif</h3>
                <p className="text-xs text-zinc-400 mt-0.5 font-sans">Ajustez les éléments de cet objectif de financement.</p>
              </div>

              <form onSubmit={handleUpdateGoal} className="space-y-5">
                {/* Titre */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Titre de l'objectif *</label>
                  <input 
                    required 
                    placeholder="ex: Financement principal des délégations" 
                    value={goalForm.title}
                    onChange={e => setGoalForm({...goalForm, title: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                {/* Cible de financement */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Montant cible (DH) *</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    placeholder="ex: 25000" 
                    value={goalForm.amount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val.includes("-")) return;
                      setGoalForm({...goalForm, amount: val});
                    }}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block font-sans">Description de l'objectif</label>
                  <textarea 
                    placeholder="ex: Cap nécessaire pour sécuriser les réservations..." 
                    rows={3} 
                    value={goalForm.description}
                    onChange={e => setGoalForm({...goalForm, description: e.target.value})}
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:border-primary focus:bg-white text-sm"
                  />
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => setShowEditGoalModal(null)} 
                    className="flex-1 py-4 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-zinc-900 transition-colors bg-transparent border border-transparent font-sans"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-4 bg-zinc-950 hover:bg-zinc-805 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-zinc-200 transition-all border-none cursor-pointer font-sans"
                  >
                    Sauvegarder
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedBlock && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBlock(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <button 
                onClick={() => setSelectedBlock(null)}
                className="absolute top-6 right-6 z-20 p-2 bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-primary transition-all rounded-full"
              >
                <X size={24} />
              </button>
              
              <div className="overflow-y-auto">
                {selectedBlock.imageUrl && (
                  <div className="w-full h-[400px] relative">
                    <img 
                      src={selectedBlock.imageUrl.includes('drive.google.com') ? `https://lh3.googleusercontent.com/d/${selectedBlock.imageUrl.split('/d/')[1]?.split('/')[0]}` : selectedBlock.imageUrl} 
                      alt={selectedBlock.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?q=80&w=1000"; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
                  </div>
                )}
                
                <div className="p-12 space-y-8 relative -mt-20">
                  <div className="space-y-4">
                    <span className="text-[10px] font-black text-primary uppercase tracking-[0.4em] bg-primary/5 px-4 py-2 rounded-full">Actualité Campagne</span>
                    <h2 className="text-5xl font-black tracking-tighter text-primary leading-tight">{selectedBlock.title}</h2>
                  </div>
                  
                  <div className="prose prose-zinc lg:prose-xl font-serif text-zinc-600 italic leading-relaxed whitespace-pre-wrap">
                    {selectedBlock.description}
                  </div>

                  <div className="pt-10 border-t border-zinc-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                        {selectedBlock.signature ? selectedBlock.signature.charAt(0) : "M"}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{selectedBlock.signature || "Mehdi Loubani"}</p>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Candidat FGSESMUN 2026</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-white/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white border border-zinc-100 shadow-2xl shadow-zinc-200 p-10 rounded-2xl"
            >
              <button 
                onClick={() => setShowAuthModal(false)}
                className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="text-center space-y-4 mb-10">
                <div className="w-12 h-12 bg-primary text-white rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Lock size={24} />
                </div>
                <h2 className="text-3xl font-bold tracking-tighter">
                  Connexion
                </h2>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">
                  Espace Administration FGSESMUN
                </p>
              </div>

              <form onSubmit={handleAuth} className="space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email</label>
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-lg outline-none focus:border-zinc-900 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Mot de passe</label>
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-lg outline-none focus:border-zinc-900 transition-colors"
                  />
                </div>

                {authError && (
                  <div className="text-red-500 text-[10px] font-bold uppercase tracking-widest bg-red-50 p-3 rounded border border-red-100">
                    Erreur: {authError}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-4 bg-primary text-white text-[11px] font-bold uppercase tracking-[0.3em] rounded-lg hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2"
                >
                  {authLoading ? <Loader2 size={16} className="animate-spin" /> : "Accéder"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSupporterModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSupporterModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="relative w-full max-w-md bg-white border border-zinc-100 shadow-2xl p-10 rounded-3xl z-10 max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowSupporterModal(false)}
                className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-900 transition-colors p-2 rounded-full hover:bg-zinc-50"
              >
                <X size={20} />
              </button>

              {supporterSuccess ? (
                <div className="text-center py-10 space-y-6">
                  <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 size={36} className="stroke-[2.5]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-black tracking-tighter text-zinc-950">Merci infiniment !</h3>
                    <p className="text-sm font-medium text-zinc-500 max-w-xs mx-auto leading-relaxed">
                      Votre soutien à la campagne FGSESMUN a été enregistré avec succès. Ensemble vers la victoire !
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowSupporterModal(false);
                      setSupporterSuccess(false);
                    }}
                    className="px-8 py-3.5 bg-zinc-900 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-800 transition-colors shadow-sm"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 bg-primary/5 text-primary rounded-full flex items-center justify-center mx-auto">
                      <Heart size={24} className="fill-current text-primary animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-black tracking-tighter text-zinc-950">Je soutiens</h2>
                      <p className="text-zinc-400 text-[9px] font-bold uppercase tracking-widest mt-1">
                        Rejoignez la campagne de Mehdi Loubani
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveSupporter} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">Nom complet</label>
                      <input 
                        type="text"
                        required
                        placeholder="Mehdi Loubani"
                        value={supporterForm.fullName}
                        onChange={(e) => setSupporterForm({...supporterForm, fullName: e.target.value})}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-lg outline-none focus:border-primary transition-colors text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">Niveau universitaire</label>
                      <input 
                        type="text"
                        required
                        placeholder="ex: L3, Master 1, ..."
                        value={supporterForm.academicLevel}
                        onChange={(e) => setSupporterForm({...supporterForm, academicLevel: e.target.value})}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-lg outline-none focus:border-primary transition-colors text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">Filière</label>
                      <select 
                        required
                        value={supporterForm.fieldOfStudy}
                        onChange={(e) => setSupporterForm({...supporterForm, fieldOfStudy: e.target.value})}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-lg outline-none focus:border-primary transition-colors text-sm"
                      >
                        <option value="" disabled>Sélectionner votre filière</option>
                        <option value="Tronc Commun">Tronc Commun</option>
                        <option value="Économie">Économie</option>
                        <option value="Droit">Droit</option>
                        <option value="Relations Internationales">Relations Internationales</option>
                        <option value="Sciences Politiques">Sciences Politiques</option>
                        <option value="Sciences Comportementales">Sciences Comportementales</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">Numéro de téléphone</label>
                      <input 
                        type="tel"
                        required
                        placeholder="ex: +212 600-000000"
                        value={supporterForm.phone}
                        onChange={(e) => setSupporterForm({...supporterForm, phone: e.target.value})}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-lg outline-none focus:border-primary transition-colors text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">Adresse Mail</label>
                      <input 
                        type="email"
                        required
                        placeholder="exemple@fgses-um6p.ma"
                        value={supporterForm.email}
                        onChange={(e) => setSupporterForm({...supporterForm, email: e.target.value})}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-lg outline-none focus:border-primary transition-colors text-sm"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={supporterSubmitting}
                      className="w-full mt-2 py-4 bg-primary text-white text-[10px] font-bold uppercase tracking-[0.25em] rounded-xl hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2 shadow-md shadow-primary/10 disabled:opacity-50"
                    >
                      {supporterSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Envoyer mon soutien"}
                    </button>
                  </form>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPromoModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowPromoModal(false);
                try { sessionStorage.setItem("fgsesmun_welcome_promo_dismissed2", "true"); } catch {}
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: "spring", damping: 25, stiffness: 180 }}
              className="relative w-full max-w-lg bg-white border border-zinc-100 shadow-2xl p-10 md:p-12 rounded-3xl z-10 text-center space-y-8"
            >
              <button 
                onClick={() => {
                  setShowPromoModal(false);
                  try { sessionStorage.setItem("fgsesmun_welcome_promo_dismissed2", "true"); } catch {}
                }}
                className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-900 transition-colors p-2 rounded-full hover:bg-zinc-50 animate-fade-in-delayed"
                title="Passer"
              >
                <X size={20} />
              </button>

              <div className="space-y-4">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <Heart size={32} className="fill-current text-primary animate-pulse" />
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] bg-primary/5 px-4 py-1.5 rounded-full inline-block">
                    URGENT // ACTION CITOYENNE
                  </span>
                  <h2 className="text-4xl font-black tracking-tighter text-zinc-950">
                    Soutenez FGSESMUN !
                  </h2>
                  <p className="text-zinc-500 font-serif italic text-base leading-relaxed max-w-md mx-auto">
                    "Votre voix est l'énergie de notre campagne. Ensemble, concevons un avenir brillant et uni pour la Simulation des Nations Unies."
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button 
                  onClick={() => {
                    setShowPromoModal(false);
                    try { sessionStorage.setItem("fgsesmun_welcome_promo_dismissed2", "true"); } catch {}
                    setSupporterSuccess(false);
                    setShowSupporterModal(true);
                  }}
                  className="w-full py-4 bg-primary text-white text-[12px] font-bold uppercase tracking-[0.25em] rounded-2xl hover:bg-opacity-95 hover:scale-[1.02] transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-primary/20"
                >
                  <Heart size={16} className="fill-current text-white animate-pulse" />
                  Je soutiens la campagne
                </button>
                
                <button 
                  onClick={() => {
                    setShowPromoModal(false);
                    try { sessionStorage.setItem("fgsesmun_welcome_promo_dismissed2", "true"); } catch {}
                  }}
                  className="text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 transition-colors py-2 block w-full text-center"
                >
                  Passer pour le moment
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-white border border-zinc-100 p-6 flex flex-col justify-between">
      <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">{label}</span>
      <span className="text-3xl font-bold tracking-tighter">{value}</span>
    </div>
  );
}




