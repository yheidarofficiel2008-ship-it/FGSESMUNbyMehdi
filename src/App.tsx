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
  Mic2,
  Info,
  ChevronRight,
  Globe
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
  
  // Admin Form State
  const [showAddForm, setShowAddForm] = useState<"none" | "program" | "conference" | "team" | "homepage">("none");
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  
  // Auth Form State
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          await getDocFromServer(doc(db, "system", "health"));
          setDbStatus("connected");

          const userRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0],
              role: "user",
              createdAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error("Database status error:", err);
          setDbStatus("error");
        }
      } else {
        // Still try a health check even if not logged in
        getDocFromServer(doc(db, "system", "health"))
          .then(() => setDbStatus("connected"))
          .catch(() => setDbStatus("error"));
      }
      setLoading(false);
    });

    return () => unsubscribe();
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
    try {
      await deleteDoc(doc(db, col, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${col}/${id}`);
    }
  };

  const handleMoveItem = async (col: string, items: any[], id: string, direction: 'up' | 'down') => {
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
      if (authMode === "register") {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: displayName || email.split("@")[0] });
        
        const userRef = doc(db, "users", userCredential.user.uid);
        await setDoc(userRef, {
          email: email,
          displayName: displayName || email.split("@")[0],
          role: "user",
          createdAt: serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setShowAuthModal(false);
    } catch (err: any) {
      console.error("Auth error:", err);
      let message = "Une erreur est survenue.";
      if (err.code === "auth/email-already-in-use") message = "Cet email est déjà utilisé.";
      if (err.code === "auth/invalid-credential") message = "Identifiants invalides.";
      if (err.code === "auth/weak-password") message = "Mot de passe trop faible.";
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
    { id: "conferences", label: "Conférences", icon: <Mic2 size={22} /> },
    { id: "equipe", label: "Équipe", icon: <Users size={22} /> },
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
              }
            }}
          />
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
              {tabs.map((tab) => (
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
                      
                      {user && (
                        <button 
                          onClick={() => {
                            setFormData({});
                            setShowAddForm("homepage");
                          }}
                          className="px-6 py-3 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-opacity-90 transition-colors mx-auto flex items-center gap-2"
                        >
                          <Plus size={14} /> Nouvel Article
                        </button>
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
                              {user && (
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
                                {user && (
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
                              <p className="text-zinc-500 text-sm leading-relaxed font-serif italic line-clamp-3 mb-6">
                                {block.description}
                              </p>
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
                      {user && (
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
                                  {user && (
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
                                {user && (
                                  <button onClick={() => handleDeleteItem("program", section.id)} className="p-2 text-zinc-300 hover:text-red-500 transition-colors">
                                    <X size={20} />
                                  </button>
                                )}
                              </div>
                              <p className="text-zinc-600 leading-relaxed font-serif text-lg whitespace-pre-wrap">{section.description}</p>
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
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase text-primary">Les Conférences</h2>
                      </div>
                      {user && (
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
                          {user && (
                            <div className="absolute top-6 left-6 flex gap-2">
                              <button 
                                onClick={() => handleMoveItem("conferences", conferences, conf.id, 'up')}
                                disabled={idx === 0}
                                className="p-1 px-2 border border-zinc-100 rounded text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 bg-white"
                              >
                                ↑
                              </button>
                              <button 
                                onClick={() => handleMoveItem("conferences", conferences, conf.id, 'down')}
                                disabled={idx === conferences.length - 1}
                                className="p-1 px-2 border border-zinc-100 rounded text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 bg-white"
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
                            <p className="text-sm text-zinc-500 font-serif italic line-clamp-4 leading-relaxed">{conf.description}</p>
                          </div>
                          {user && (
                            <button onClick={() => handleDeleteItem("conferences", conf.id)} className="absolute top-6 right-6 text-zinc-300 hover:text-red-500 transition-colors">
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
                      {user && (
                        <button 
                          onClick={() => {
                            setFormData({});
                            setShowAddForm("team");
                          }}
                          className="px-4 py-2 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-lg"
                        >
                          Ajouter un membre
                        </button>
                      )}
                    </header>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                      {team.map((member, idx) => (
                        <div key={member.id} className="bg-white p-6 md:p-10 border border-zinc-100 hover:border-primary/30 transition-all duration-500 group relative text-center rounded-3xl shadow-sm">
                          {user && (
                            <div className="absolute top-6 left-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleMoveItem("team", team, member.id, 'up')}
                                disabled={idx === 0}
                                className="p-2 border border-zinc-100 rounded-full text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 flex items-center justify-center bg-white shadow-sm"
                              >
                                <ChevronRight className="rotate-[-90deg]" size={12} />
                              </button>
                              <button 
                                onClick={() => handleMoveItem("team", team, member.id, 'down')}
                                disabled={idx === team.length - 1}
                                className="p-2 border border-zinc-100 rounded-full text-[10px] font-bold hover:bg-zinc-50 disabled:opacity-30 flex items-center justify-center bg-white shadow-sm"
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
                            <p className="text-sm text-zinc-500 font-serif italic mb-6 line-clamp-3 leading-relaxed">{member.description}</p>
                          )}
                          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 border-t border-zinc-50 pt-6 cursor-default group-hover:text-primary transition-colors">
                            {member.contact}
                          </div>
                          {user && (
                            <button onClick={() => handleDeleteItem("team", member.id)} className="absolute top-6 right-6 text-zinc-300 hover:text-red-500 transition-colors">
                              <X size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
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
                  {authMode === "login" ? "Connexion" : "Inscription"}
                </h2>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">
                  Espace Administration FGSESMUN
                </p>
              </div>

              <form onSubmit={handleAuth} className="space-y-6">
                {authMode === "register" && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Nom</label>
                    <input 
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-lg outline-none focus:border-zinc-900 transition-colors"
                    />
                  </div>
                )}
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
                  {authLoading ? <Loader2 size={16} className="animate-spin" /> : (authMode === "login" ? "Accéder" : "S'inscrire")}
                </button>
              </form>

              <div className="mt-8 text-center">
                <button 
                  onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
                  className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 transition-colors underline underline-offset-4"
                >
                  {authMode === "login" ? "Pas de compte ?" : "Déjà un compte ?"}
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




