import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Minus, Search, X, Check, ArrowLeft, Package, Users,
  Wallet, History as HistoryIcon, ChevronRight, AlertTriangle,
  Banknote, Smartphone, CreditCard, LogOut, Store, ShieldCheck,
  Building2, Clock, TrendingUp, Activity,
} from "lucide-react";

// ============================================================
// DESIGN TOKENS (identiques au prototype validé)
// ============================================================
const T = {
  bg: "#FBF7F0", ink: "#2B2118", inkSoft: "#7A6E5D", card: "#FFFFFF", line: "#EBE3D5",
  green: "#1E7A4C", greenSoft: "#E5F2EA",
  terracotta: "#C6572A", terracottaSoft: "#FBEAE1",
  gold: "#D9A441", goldSoft: "#FAF1DD",
};
// Le QG a sa propre teinte pour ne jamais être confondu visuellement avec l'app commerçant
const QG = {
  bg: "#12181F", ink: "#EDEFF2", inkSoft: "#8B94A3", card: "#1B2530", line: "#2A3644",
  accent: "#4C8DFF", accentSoft: "#1C2C42",
  warn: "#E0A93E", warnSoft: "#2E2718",
  danger: "#E0554E", dangerSoft: "#33201F",
};

const EXPENSE_CATEGORIES = ["Transport", "Électricité", "Eau", "Loyer", "Livraison", "Achat", "Réparation", "Autre"];
const TRIAL_DAYS = 7;

function fmt(n) {
  return Math.round(n || 0).toLocaleString("fr-FR").replace(/,/g, " ") + " FCFA";
}
function todayLabel() {
  return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function uid(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// ============================================================
// COUCHE PERSISTANCE — Supabase (table kv_store), partagée entre
// tous les appareils : le QG (ton téléphone) voit en quasi temps
// réel ce qui se passe sur l'appareil du commerçant.
// ============================================================
const SUPABASE_URL = "https://xaizqcfbstzemtdmnmfp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SQ2KEktSwZoHmDQC-G9Iog_1XEiCa91";

const sbHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

async function loadJSON(key, fallback) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: sbHeaders }
    );
    if (!res.ok) return fallback;
    const rows = await res.json();
    return rows.length > 0 ? rows[0].value : fallback;
  } catch {
    return fallback;
  }
}

async function saveJSON(key, value) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/kv_store`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.error("Erreur de sauvegarde", e);
  }
}

function defaultBusinessData(name) {
  return {
    name,
    createdAt: new Date().toISOString(),
    trialStart: new Date().toISOString(),
    plan: "essai", // essai | actif | expire
    products: [
      { id: "p1", name: "Riz marque X", unit: "sac", price: 18000, cost: 15000, stock: 24, threshold: 10 },
      { id: "p2", name: "Lait Nido", unit: "boîte", price: 2500, cost: 2000, stock: 40, threshold: 15 },
      { id: "p3", name: "Huile végétale", unit: "bidon", price: 7500, cost: 6200, stock: 8, threshold: 10 },
      { id: "p4", name: "Sucre", unit: "sac", price: 16000, cost: 13500, stock: 12, threshold: 6 },
    ],
    clients: [],
    movements: [],
    cashByMethod: { especes: 0, momo: 0, om: 0 },
    activityLog: [],
    lastLogin: new Date().toISOString(),
  };
}

// ============================================================
// APP RACINE — routeur minimal entre les 3 espaces
// ============================================================
export default function App() {
  const [space, setSpace] = useState("loading"); // loading | landing | merchant | qg
  const [session, setSession] = useState(null); // { businessId, businessName }
  const [registry, setRegistry] = useState(null); // liste globale des commerces (pour le QG)

  useEffect(() => {
    (async () => {
      const savedSession = await loadJSON("session:current", null);
      const reg = await loadJSON("registry:businesses", []);
      setRegistry(reg);
      if (savedSession) {
        setSession(savedSession);
        setSpace("merchant");
      } else {
        setSpace("landing");
      }
    })();
  }, []);

  async function registerBusiness(name, ownerPhone) {
    const businessId = uid("biz");
    const data = defaultBusinessData(name);
    await saveJSON(`business:${businessId}`, data);
    const reg = await loadJSON("registry:businesses", []);
    const entry = { businessId, name, ownerPhone, createdAt: data.createdAt, trialStart: data.trialStart, plan: "essai" };
    const nextReg = [...reg, entry];
    await saveJSON("registry:businesses", nextReg);
    setRegistry(nextReg);
    const newSession = { businessId, businessName: name };
    await saveJSON("session:current", newSession);
    setSession(newSession);
    setSpace("merchant");
  }

  async function logout() {
    await saveJSON("session:current", null);
    setSession(null);
    setSpace("landing");
  }

  if (space === "loading") {
    return <div style={{ minHeight: "100vh", background: T.bg }} />;
  }

  if (space === "landing") {
    return <Landing onRegister={registerBusiness} onOpenQG={() => setSpace("qg-login")} />;
  }

  if (space === "qg-login") {
    return <QGLogin onSuccess={() => setSpace("qg")} onBack={() => setSpace("landing")} />;
  }

  if (space === "qg") {
    return <QGConsole registry={registry} setRegistry={setRegistry} onExit={() => setSpace("landing")} />;
  }

  if (space === "merchant" && session) {
    return <MerchantApp session={session} onLogout={logout} />;
  }

  return null;
}

// ============================================================
// LANDING — inscription minimale (nom du commerce, téléphone)
// ============================================================
function Landing({ onRegister, onOpenQG }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const canSubmit = name.trim().length > 1 && phone.trim().length >= 8;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Nunito', system-ui, sans-serif", color: T.ink }}>
      <FontImports />
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Store size={26} color={T.green} />
          <span style={{ fontSize: 15, fontWeight: 800, color: T.green }}>Mon Commerce</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginTop: 10, marginBottom: 8 }}>
          Le cahier de votre commerce, en mieux
        </h1>
        <p style={{ fontSize: 14, color: T.inkSoft, marginBottom: 32, lineHeight: 1.5 }}>
          Enregistrez vos ventes, votre stock et vos dépenses. L'application fait les calculs.
        </p>

        <FieldLabel>Nom de votre commerce</FieldLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Boutique Chourèm" style={inputStyle} />
        <FieldLabel>Votre numéro de téléphone</FieldLabel>
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9\s]/g, ""))} placeholder="6XX XXX XXX" style={inputStyle} inputMode="numeric" />

        <button className="press" disabled={!canSubmit} onClick={() => onRegister(name.trim(), phone.trim())} style={{
          width: "100%", padding: 17, borderRadius: 16, border: "none",
          background: canSubmit ? T.green : T.line, color: canSubmit ? "#fff" : T.inkSoft,
          fontWeight: 800, fontSize: 15, cursor: canSubmit ? "pointer" : "not-allowed", marginTop: 8,
        }}>
          Commencer mon essai gratuit ({TRIAL_DAYS} jours)
        </button>

        <button className="press" onClick={onOpenQG} style={{
          width: "100%", marginTop: 28, padding: 10, background: "none", border: "none",
          color: T.inkSoft, fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: 0.6,
        }}>
          Accès administrateur
        </button>
      </div>
    </div>
  );
}

// ============================================================
// QG — LOGIN (mot de passe simple, suffisant pour un pilote à 1 admin)
// ============================================================
function QGLogin({ onSuccess, onBack }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState(false);
  // Mot de passe de démonstration — à remplacer par une vraie auth avant tout usage au-delà du pilote.
  const QG_PASSWORD = "qg2026";

  return (
    <div style={{ minHeight: "100vh", background: QG.bg, fontFamily: "'Nunito', system-ui, sans-serif", color: QG.ink, display: "flex", alignItems: "center" }}>
      <FontImports />
      <div style={{ maxWidth: 380, margin: "0 auto", padding: 24, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, justifyContent: "center" }}>
          <ShieldCheck size={22} color={QG.accent} />
          <span style={{ fontSize: 15, fontWeight: 800 }}>QG Administrateur</span>
        </div>
        <input
          type="password"
          value={pass}
          onChange={(e) => { setPass(e.target.value); setError(false); }}
          placeholder="Mot de passe"
          style={{ ...inputStyle, background: QG.card, border: `1.5px solid ${error ? QG.danger : QG.line}`, color: QG.ink }}
        />
        {error && <div style={{ fontSize: 12, color: QG.danger, marginTop: -8, marginBottom: 14 }}>Mot de passe incorrect.</div>}
        <button className="press" onClick={() => (pass === QG_PASSWORD ? onSuccess() : setError(true))} style={{
          width: "100%", padding: 15, borderRadius: 12, border: "none", background: QG.accent,
          color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 10,
        }}>
          Entrer
        </button>
        <button className="press" onClick={onBack} style={{ width: "100%", padding: 10, background: "none", border: "none", color: QG.inkSoft, fontSize: 13, cursor: "pointer" }}>
          Retour
        </button>
      </div>
    </div>
  );
}

// ============================================================
// QG — CONSOLE (minimale : liste des commerces, statut d'essai, activité)
// ============================================================
function QGConsole({ registry, setRegistry, onExit }) {
  const [selected, setSelected] = useState(null);
  const [businessData, setBusinessData] = useState(null);

  const list = registry || [];
  const activeTrials = list.filter((b) => b.plan === "essai" && daysSince(b.trialStart) < TRIAL_DAYS);
  const expiredTrials = list.filter((b) => b.plan === "essai" && daysSince(b.trialStart) >= TRIAL_DAYS);
  const paying = list.filter((b) => b.plan === "actif");

  async function openBusiness(entry) {
    setSelected(entry);
    const data = await loadJSON(`business:${entry.businessId}`, null);
    setBusinessData(data);
  }

  async function extendTrial(entry) {
    const updated = { ...entry, trialStart: new Date().toISOString() };
    const nextReg = list.map((b) => (b.businessId === entry.businessId ? updated : b));
    setRegistry(nextReg);
    await saveJSON("registry:businesses", nextReg);
    setSelected(updated);
  }

  async function markAsPaying(entry) {
    const updated = { ...entry, plan: "actif" };
    const nextReg = list.map((b) => (b.businessId === entry.businessId ? updated : b));
    setRegistry(nextReg);
    await saveJSON("registry:businesses", nextReg);
    setSelected(updated);
  }

  return (
    <div style={{ minHeight: "100vh", background: QG.bg, fontFamily: "'Nunito', system-ui, sans-serif", color: QG.ink }}>
      <FontImports />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldCheck size={20} color={QG.accent} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>QG</span>
          </div>
          <button className="press" onClick={onExit} style={{ border: "none", background: "none", color: QG.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
            <LogOut size={16} /> Quitter
          </button>
        </div>

        {selected ? (
          <BusinessProfile
            entry={selected}
            data={businessData}
            onBack={() => { setSelected(null); setBusinessData(null); }}
            onExtendTrial={() => extendTrial(selected)}
            onMarkPaying={() => markAsPaying(selected)}
          />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
              <QGKpi label="Commerces" value={list.length} icon={Building2} />
              <QGKpi label="Essais en cours" value={activeTrials.length} icon={Clock} />
              <QGKpi label="Payants" value={paying.length} icon={TrendingUp} />
            </div>

            {expiredTrials.length > 0 && (
              <div style={{ background: QG.warnSoft, border: `1px solid ${QG.warn}44`, borderRadius: 14, padding: "12px 14px", marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
                <AlertTriangle size={18} color={QG.warn} />
                <span style={{ fontSize: 13, fontWeight: 700, color: QG.warn }}>
                  {expiredTrials.length} essai{expiredTrials.length > 1 ? "s" : ""} arrivé{expiredTrials.length > 1 ? "s" : ""} à expiration
                </span>
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 700, color: QG.inkSoft, marginBottom: 10 }}>Commerces</div>
            {list.length === 0 && (
              <div style={{ fontSize: 13, color: QG.inkSoft, padding: "20px 0", textAlign: "center" }}>
                Aucun commerce inscrit pour l'instant.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map((b) => {
                const expired = b.plan === "essai" && daysSince(b.trialStart) >= TRIAL_DAYS;
                const dayN = Math.min(daysSince(b.trialStart) + 1, TRIAL_DAYS);
                return (
                  <button key={b.businessId} className="press" onClick={() => openBusiness(b)} style={{
                    width: "100%", textAlign: "left", background: QG.card, border: `1px solid ${QG.line}`,
                    borderRadius: 14, padding: "13px 14px", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
                      <div style={{ fontSize: 12, color: QG.inkSoft }}>{b.ownerPhone}</div>
                    </div>
                    <StatusBadge plan={b.plan} expired={expired} dayN={dayN} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function QGKpi({ label, value, icon: Icon }) {
  return (
    <div style={{ background: QG.card, border: `1px solid ${QG.line}`, borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
      <Icon size={16} color={QG.accent} style={{ marginBottom: 6 }} />
      <div style={{ fontSize: 20, fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: QG.inkSoft }}>{label}</div>
    </div>
  );
}

function StatusBadge({ plan, expired, dayN }) {
  if (plan === "actif") {
    return <span style={{ fontSize: 11, fontWeight: 800, color: T.green, background: QG.accentSoft, padding: "4px 10px", borderRadius: 20 }}>Payant</span>;
  }
  if (expired) {
    return <span style={{ fontSize: 11, fontWeight: 800, color: QG.danger, background: QG.dangerSoft, padding: "4px 10px", borderRadius: 20 }}>Essai expiré</span>;
  }
  return <span style={{ fontSize: 11, fontWeight: 800, color: QG.warn, background: QG.warnSoft, padding: "4px 10px", borderRadius: 20 }}>Jour {dayN}/{TRIAL_DAYS}</span>;
}

function BusinessProfile({ entry, data, onBack, onExtendTrial, onMarkPaying }) {
  if (!data) {
    return (
      <div>
        <QGBackHeader title={entry.name} onBack={onBack} />
        <div style={{ color: QG.inkSoft, fontSize: 13 }}>Chargement…</div>
      </div>
    );
  }

  const expired = entry.plan === "essai" && daysSince(entry.trialStart) >= TRIAL_DAYS;
  const dayN = Math.min(daysSince(entry.trialStart) + 1, TRIAL_DAYS);
  const salesCount = data.movements.filter((m) => m.kind === "vente").length;
  const totalRevenue = data.movements.filter((m) => m.kind === "vente").reduce((s, m) => s + m.amount, 0);
  const recentActivity = data.movements.slice(0, 8);

  return (
    <div>
      <QGBackHeader title={entry.name} onBack={onBack} />
      <div style={{ marginBottom: 4 }}>
        <StatusBadge plan={entry.plan} expired={expired} dayN={dayN} />
      </div>
      <div style={{ fontSize: 12, color: QG.inkSoft, marginBottom: 20 }}>{entry.ownerPhone} · Inscrit le {new Date(entry.createdAt).toLocaleDateString("fr-FR")}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <QGMiniStat label="Ventes enregistrées" value={salesCount} />
        <QGMiniStat label="Chiffre d'affaires" value={fmt(totalRevenue)} />
        <QGMiniStat label="Produits" value={data.products.length} />
        <QGMiniStat label="Clients" value={data.clients.length} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {entry.plan === "essai" && (
          <>
            <button className="press" onClick={onExtendTrial} style={{
              flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${QG.line}`, background: QG.card,
              color: QG.ink, fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              Prolonger l'essai
            </button>
            <button className="press" onClick={onMarkPaying} style={{
              flex: 1, padding: 12, borderRadius: 12, border: "none", background: QG.accent,
              color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              Marquer payant
            </button>
          </>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: QG.inkSoft, marginBottom: 10 }}>Activité récente</div>
      {recentActivity.length === 0 && (
        <div style={{ fontSize: 13, color: QG.inkSoft, padding: "10px 0" }}>Aucune activité enregistrée pour l'instant.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {recentActivity.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", background: QG.card, border: `1px solid ${QG.line}`, borderRadius: 10, padding: "9px 12px" }}>
            <span style={{ fontSize: 12 }}>{m.kind === "vente" ? "Vente" : "Dépense"} — {m.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(m.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QGMiniStat({ label, value }) {
  return (
    <div style={{ background: QG.card, border: `1px solid ${QG.line}`, borderRadius: 12, padding: "11px 13px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: QG.inkSoft, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function QGBackHeader({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <button className="press" onClick={onBack} style={{
        border: "none", background: QG.card, borderRadius: 10, width: 36, height: 36,
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: QG.ink,
      }}>
        <ArrowLeft size={18} />
      </button>
      <h1 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{title}</h1>
    </div>
  );
}

// ============================================================
// APPLICATION COMMERÇANT — logique du prototype validé,
// désormais branchée sur la persistance par tenant
// ============================================================
function MerchantApp({ session, onLogout }) {
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("home");
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [cart, setCart] = useState([]);
  const [movements, setMovements] = useState([]);
  const [cashByMethod, setCashByMethod] = useState({ especes: 0, momo: 0, om: 0 });
  const [toast, setToast] = useState(null);
  const [saleClient, setSaleClient] = useState(null);
  const [trialInfo, setTrialInfo] = useState(null);

  const key = `business:${session.businessId}`;

  useEffect(() => {
    (async () => {
      const data = await loadJSON(key, defaultBusinessData(session.businessName));
      setProducts(data.products || []);
      setClients(data.clients || []);
      setMovements((data.movements || []).map((m) => ({ ...m, time: new Date(m.time) })));
      setCashByMethod(data.cashByMethod || { especes: 0, momo: 0, om: 0 });
      setTrialInfo({ trialStart: data.trialStart, plan: data.plan });
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(async (patch) => {
    const current = await loadJSON(key, {});
    await saveJSON(key, { ...current, ...patch });
  }, [key]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  const todaySales = movements.filter((m) => m.kind === "vente");
  const todayExpenses = movements.filter((m) => m.kind === "depense");
  const totalSalesToday = todaySales.reduce((s, m) => s + m.amount, 0);
  const totalExpensesToday = todayExpenses.reduce((s, m) => s + m.amount, 0);
  const lowStock = products.filter((p) => p.stock <= p.threshold);
  const totalDebt = clients.reduce((s, c) => s + c.debt, 0);
  const totalCash = cashByMethod.especes + cashByMethod.momo + cashByMethod.om;

  async function finalizeSale(paymentMethod, isCredit) {
    const total = cart.reduce((s, item) => {
      const p = products.find((x) => x.id === item.productId);
      return s + p.price * item.qty;
    }, 0);

    const nextProducts = products.map((p) => {
      const item = cart.find((c) => c.productId === p.id);
      return item ? { ...p, stock: p.stock - item.qty } : p;
    });

    const label = cart.map((item) => {
      const p = products.find((x) => x.id === item.productId);
      return `${p.name} × ${item.qty}`;
    }).join(", ");

    const newMovement = {
      id: uid("v"), kind: "vente", label, amount: total,
      method: isCredit ? "credit" : paymentMethod, time: new Date(), client: saleClient,
    };
    const nextMovements = [newMovement, ...movements];

    let nextClients = clients;
    let nextCash = cashByMethod;

    if (isCredit && saleClient) {
      nextClients = clients.map((c) => (c.id === saleClient.id ? { ...c, debt: c.debt + total, totalBought: c.totalBought + total } : c));
    } else {
      const methodKey = paymentMethod === "especes" ? "especes" : paymentMethod === "momo" ? "momo" : "om";
      nextCash = { ...cashByMethod, [methodKey]: cashByMethod[methodKey] + total };
      if (saleClient) {
        nextClients = clients.map((c) => (c.id === saleClient.id ? { ...c, totalBought: c.totalBought + total } : c));
      }
    }

    setProducts(nextProducts);
    setMovements(nextMovements);
    setClients(nextClients);
    setCashByMethod(nextCash);
    setCart([]);
    setSaleClient(null);
    notify("Vente enregistrée ✅");
    setScreen("home");

    await persist({ products: nextProducts, movements: nextMovements, clients: nextClients, cashByMethod: nextCash });
  }

  async function addExpense(category, amount) {
    const newMovement = { id: uid("d"), kind: "depense", label: category, amount, time: new Date() };
    const nextMovements = [newMovement, ...movements];
    const nextCash = { ...cashByMethod, especes: cashByMethod.especes - amount };
    setMovements(nextMovements);
    setCashByMethod(nextCash);
    notify("Dépense ajoutée ✅");
    await persist({ movements: nextMovements, cashByMethod: nextCash });
  }

  async function recordDebtPayment(clientId, amount) {
    const nextClients = clients.map((c) => (c.id === clientId ? { ...c, debt: Math.max(0, c.debt - amount) } : c));
    const nextCash = { ...cashByMethod, especes: cashByMethod.especes + amount };
    setClients(nextClients);
    setCashByMethod(nextCash);
    notify("Paiement enregistré ✅");
    await persist({ clients: nextClients, cashByMethod: nextCash });
  }

  async function addProduct(p) {
    const nextProducts = [...products, { ...p, id: uid("p") }];
    setProducts(nextProducts);
    await persist({ products: nextProducts });
  }

  if (!loaded) {
    return <div style={{ minHeight: "100vh", background: T.bg }} />;
  }

  const expired = trialInfo?.plan === "essai" && daysSince(trialInfo.trialStart) >= TRIAL_DAYS;

  if (expired) {
    return <TrialExpiredScreen businessName={session.businessName} onLogout={onLogout} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Nunito', system-ui, sans-serif", color: T.ink }}>
      <FontImports />
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", position: "relative", paddingBottom: 90 }}>
        {screen === "home" && (
          <Home
            businessName={session.businessName}
            totalSalesToday={totalSalesToday}
            salesCount={todaySales.length}
            totalExpensesToday={totalExpensesToday}
            totalCash={totalCash}
            totalDebt={totalDebt}
            lowStock={lowStock}
            trialInfo={trialInfo}
            onNewSale={() => setScreen("sale")}
            onExpense={() => setScreen("cash")}
            onStock={() => setScreen("products")}
            onClients={() => setScreen("clients")}
            onLogout={onLogout}
          />
        )}
        {screen === "sale" && (
          <SaleFlow
            products={products} clients={clients} cart={cart} setCart={setCart}
            saleClient={saleClient} setSaleClient={setSaleClient}
            onBack={() => { setCart([]); setSaleClient(null); setScreen("home"); }}
            onFinalize={finalizeSale}
          />
        )}
        {screen === "products" && <ProductsScreen products={products} onAdd={addProduct} onBack={() => setScreen("home")} />}
        {screen === "clients" && <ClientsScreen clients={clients} onBack={() => setScreen("home")} onRecordPayment={recordDebtPayment} />}
        {screen === "cash" && (
          <CashScreen cashByMethod={cashByMethod} totalCash={totalCash} totalExpensesToday={totalExpensesToday} onBack={() => setScreen("home")} onAddExpense={addExpense} />
        )}
        {screen === "history" && <HistoryScreen movements={movements} onBack={() => setScreen("home")} />}

        {screen !== "sale" && (
          <BottomNav
            active={screen}
            onHome={() => setScreen("home")}
            onProducts={() => setScreen("products")}
            onClients={() => setScreen("clients")}
            onHistory={() => setScreen("history")}
            onSale={() => setScreen("sale")}
          />
        )}

        {toast && (
          <div style={{
            position: "fixed", bottom: screen === "sale" ? 20 : 96, left: "50%", transform: "translateX(-50%)",
            background: T.ink, color: "#fff", padding: "11px 22px", borderRadius: 30,
            fontSize: 14, fontWeight: 700, boxShadow: "0 8px 24px rgba(43,33,24,0.25)", zIndex: 60,
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function TrialExpiredScreen({ businessName, onLogout }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Nunito', system-ui, sans-serif", color: T.ink, display: "flex", alignItems: "center" }}>
      <FontImports />
      <div style={{ maxWidth: 400, margin: "0 auto", padding: 24, textAlign: "center" }}>
        <Clock size={40} color={T.terracotta} style={{ marginBottom: 16 }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Votre essai est terminé</h1>
        <p style={{ fontSize: 14, color: T.inkSoft, marginBottom: 24 }}>
          Contactez-nous pour continuer à utiliser {businessName} sur l'application.
        </p>
        <button className="press" onClick={onLogout} style={{
          padding: "12px 24px", borderRadius: 12, border: "none", background: T.ink,
          color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}>
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}

// ---------- ACCUEIL ----------
function Home({ businessName, totalSalesToday, salesCount, totalExpensesToday, totalCash, totalDebt, lowStock, trialInfo, onNewSale, onExpense, onStock, onClients, onLogout }) {
  const dayN = trialInfo?.plan === "essai" ? Math.min(daysSince(trialInfo.trialStart) + 1, TRIAL_DAYS) : null;
  return (
    <div>
      <div style={{ padding: "24px 20px 4px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 700, textTransform: "capitalize" }}>{todayLabel()}</div>
          <div style={{ fontSize: 21, fontWeight: 900, marginTop: 2 }}>{businessName}</div>
        </div>
        <button className="press" onClick={onLogout} style={{ border: "none", background: "none", cursor: "pointer", padding: 6, color: T.inkSoft }}>
          <LogOut size={18} />
        </button>
      </div>

      {dayN && (
        <div style={{ padding: "10px 20px 0" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.gold, background: T.goldSoft, padding: "4px 10px", borderRadius: 20 }}>
            Essai gratuit — Jour {dayN}/{TRIAL_DAYS}
          </span>
        </div>
      )}

      <div style={{ padding: "18px 20px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, marginBottom: 4 }}>Ventes aujourd'hui</div>
        <div style={{ fontSize: 42, fontWeight: 900, color: T.green, lineHeight: 1.1 }}>{fmt(totalSalesToday)}</div>
        <div style={{ fontSize: 13, color: T.inkSoft, fontWeight: 600, marginTop: 2 }}>{salesCount} vente{salesCount !== 1 ? "s" : ""}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "18px 20px" }}>
        <MiniCard label="Dépenses" value={fmt(totalExpensesToday)} color={T.terracotta} onClick={onExpense} />
        <MiniCard label="Dans la caisse" value={fmt(totalCash)} color={T.ink} onClick={onExpense} />
        <MiniCard label="Argent à recevoir" value={fmt(totalDebt)} color={T.gold} onClick={onClients} />
        <MiniCard label="Stock faible" value={`${lowStock.length} produit${lowStock.length !== 1 ? "s" : ""}`} color={lowStock.length > 0 ? T.terracotta : T.green} onClick={onStock} />
      </div>

      {lowStock.length > 0 && (
        <div style={{ padding: "0 20px 18px" }}>
          <button className="press" onClick={onStock} style={{
            width: "100%", textAlign: "left", background: T.terracottaSoft, border: "none", borderRadius: 16,
            padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
          }}>
            <AlertTriangle size={20} color={T.terracotta} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: T.terracotta }}>Stock faible</div>
              <div style={{ fontSize: 12, color: T.ink, opacity: 0.75 }}>
                {lowStock.slice(0, 2).map((p) => p.name).join(", ")}{lowStock.length > 2 ? "…" : ""}
              </div>
            </div>
          </button>
        </div>
      )}

      <div style={{ padding: "4px 20px 8px" }}>
        <button className="press" onClick={onNewSale} style={{
          width: "100%", padding: "20px", borderRadius: 20, border: "none", background: T.green,
          color: "#fff", fontSize: 18, fontWeight: 900, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          boxShadow: "0 10px 24px rgba(30,122,76,0.28)",
        }}>
          <Plus size={24} strokeWidth={3} /> Nouvelle vente
        </button>
      </div>
    </div>
  );
}

function MiniCard({ label, value, color, onClick }) {
  return (
    <button className="press" onClick={onClick} style={{
      background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, padding: "14px",
      textAlign: "left", cursor: "pointer",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>{value}</div>
    </button>
  );
}

function BottomNav({ active, onHome, onProducts, onClients, onHistory, onSale }) {
  const items = [
    { key: "home", label: "Accueil", icon: Wallet, onClick: onHome },
    { key: "products", label: "Stock", icon: Package, onClick: onProducts },
    { key: "sale", label: "Vente", icon: Plus, onClick: onSale, central: true },
    { key: "clients", label: "Clients", icon: Users, onClick: onClients },
    { key: "history", label: "Historique", icon: HistoryIcon, onClick: onHistory },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480,
      background: T.card, borderTop: `1px solid ${T.line}`, display: "flex", padding: "8px 8px 12px", zIndex: 40,
    }}>
      {items.map((it) => {
        const isActive = active === it.key;
        if (it.central) {
          return (
            <button key={it.key} className="press" onClick={it.onClick} style={{ flex: 1, display: "flex", justifyContent: "center", border: "none", background: "none", cursor: "pointer" }}>
              <div style={{
                width: 50, height: 50, borderRadius: "50%", background: T.green, marginTop: -22,
                display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(30,122,76,0.35)",
              }}>
                <Plus size={26} color="#fff" strokeWidth={3} />
              </div>
            </button>
          );
        }
        return (
          <button key={it.key} className="press" onClick={it.onClick} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            border: "none", background: "none", cursor: "pointer", padding: "4px 0",
          }}>
            <it.icon size={20} color={isActive ? T.green : T.inkSoft} />
            <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? T.green : T.inkSoft }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- NOUVELLE VENTE ----------
function SaleFlow({ products, clients, cart, setCart, saleClient, setSaleClient, onBack, onFinalize }) {
  const [step, setStep] = useState("pick");
  const [search, setSearch] = useState("");
  const [showClientPicker, setShowClientPicker] = useState(false);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const total = cart.reduce((s, item) => {
    const p = products.find((x) => x.id === item.productId);
    return s + p.price * item.qty;
  }, 0);

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return prev;
        return prev.map((c) => (c.productId === product.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { productId: product.id, qty: 1 }];
    });
  }

  function changeQty(productId, delta) {
    setCart((prev) => prev.map((c) => (c.productId === productId ? { ...c, qty: c.qty + delta } : c)).filter((c) => c.qty > 0));
  }

  if (step === "payment") {
    return (
      <PaymentStep total={total} client={saleClient} onPickClient={() => setShowClientPicker(true)} onBack={() => setStep("pick")} onFinalize={onFinalize}>
        {showClientPicker && (
          <ClientPickerSheet clients={clients} onPick={(c) => { setSaleClient(c); setShowClientPicker(false); }} onSkip={() => { setSaleClient(null); setShowClientPicker(false); }} onClose={() => setShowClientPicker(false)} />
        )}
      </PaymentStep>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 20px 14px" }}>
        <button className="press" onClick={onBack} style={backBtnStyle}><ArrowLeft size={20} /></button>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Que voulez-vous vendre ?</h1>
      </div>

      <div style={{ padding: "0 20px 12px" }}>
        <div style={{ position: "relative" }}>
          <Search size={18} color={T.inkSoft} style={{ position: "absolute", left: 14, top: 14 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit…" style={{ ...inputStyle, paddingLeft: 42, marginBottom: 0 }} />
        </div>
      </div>

      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8, maxHeight: cart.length > 0 ? "38vh" : "56vh", overflowY: "auto" }}>
        {filtered.map((p) => {
          const inCart = cart.find((c) => c.productId === p.id);
          return (
            <button key={p.id} className="press" onClick={() => addToCart(p)} disabled={p.stock === 0} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: T.card, border: `1.5px solid ${inCart ? T.green : T.line}`, borderRadius: 14,
              padding: "12px 14px", cursor: p.stock === 0 ? "not-allowed" : "pointer", opacity: p.stock === 0 ? 0.5 : 1, textAlign: "left",
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: T.inkSoft }}>{fmt(p.price)} / {p.unit} · {p.stock} en stock</div>
              </div>
              {inCart ? (
                <div style={{ background: T.greenSoft, color: T.green, fontWeight: 800, fontSize: 13, padding: "4px 10px", borderRadius: 20 }}>{inCart.qty}</div>
              ) : (
                <Plus size={20} color={T.green} />
              )}
            </button>
          );
        })}
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: T.inkSoft, fontSize: 14 }}>Aucun produit trouvé.</div>}
      </div>

      {cart.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480,
          background: T.card, borderTop: `1px solid ${T.line}`, padding: "14px 20px 18px", boxShadow: "0 -8px 24px rgba(0,0,0,0.06)",
        }}>
          <div style={{ maxHeight: "22vh", overflowY: "auto", marginBottom: 10 }}>
            {cart.map((item) => {
              const p = products.find((x) => x.id === item.productId);
              return (
                <div key={item.productId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="press" onClick={() => changeQty(item.productId, -1)} style={qtyBtnStyle}><Minus size={14} /></button>
                    <span style={{ fontWeight: 800, minWidth: 16, textAlign: "center" }}>{item.qty}</span>
                    <button className="press" onClick={() => changeQty(item.productId, 1)} disabled={item.qty >= p.stock} style={qtyBtnStyle}><Plus size={14} /></button>
                    <span style={{ fontWeight: 800, fontSize: 13, minWidth: 70, textAlign: "right" }}>{fmt(p.price * item.qty)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.inkSoft }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: T.green }}>{fmt(total)}</span>
          </div>
          <button className="press" onClick={() => setStep("payment")} style={{ width: "100%", padding: 16, borderRadius: 16, border: "none", background: T.green, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            Continuer
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentStep({ total, client, onPickClient, onBack, onFinalize, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 20px 14px" }}>
        <button className="press" onClick={onBack} style={backBtnStyle}><ArrowLeft size={20} /></button>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Comment le client a payé ?</h1>
      </div>
      <div style={{ padding: "0 20px" }}>
        <div style={{ background: T.greenSoft, borderRadius: 16, padding: "18px", textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft }}>Total à payer</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: T.green }}>{fmt(total)}</div>
        </div>
        <button className="press" onClick={onPickClient} style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "13px 16px", marginBottom: 20, cursor: "pointer",
        }}>
          <span style={{ fontSize: 13, color: T.inkSoft, fontWeight: 600 }}>
            Client : <strong style={{ color: T.ink }}>{client ? client.name : "Client de passage"}</strong>
          </span>
          <ChevronRight size={16} color={T.inkSoft} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <PayButton icon={Banknote} label="Espèces" color={T.green} onClick={() => onFinalize("especes", false)} />
          <PayButton icon={Smartphone} label="MTN Mobile Money" color={T.gold} onClick={() => onFinalize("momo", false)} />
          <PayButton icon={Smartphone} label="Orange Money" color={T.terracotta} onClick={() => onFinalize("om", false)} />
          {client && <PayButton icon={CreditCard} label={`À crédit (${client.name})`} color={T.inkSoft} onClick={() => onFinalize(null, true)} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function PayButton({ icon: Icon, label, color, onClick }) {
  return (
    <button className="press" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "16px",
      borderRadius: 14, border: `1.5px solid ${color}33`, background: `${color}10`, cursor: "pointer", textAlign: "left",
    }}>
      <Icon size={20} color={color} />
      <span style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{label}</span>
    </button>
  );
}

function ClientPickerSheet({ clients, onPick, onSkip, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,24,0.4)", zIndex: 70, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.card, width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: "18px 20px 24px", maxHeight: "60vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Qui est le client ?</h2>
          <button className="press" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <button className="press" onClick={onSkip} style={{
          width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px dashed ${T.line}`,
          background: "none", marginBottom: 10, cursor: "pointer", fontWeight: 700, fontSize: 14, color: T.inkSoft,
        }}>
          Client de passage (pas de suivi)
        </button>
        {clients.map((c) => (
          <button key={c.id} className="press" onClick={() => onPick(c)} style={{ width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px solid ${T.line}`, background: T.card, marginBottom: 8, cursor: "pointer" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: T.inkSoft }}>{c.phone}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- PRODUITS & STOCK ----------
function ProductsScreen({ products, onAdd, onBack }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div>
      <ScreenHeader title="Mes produits" onBack={onBack} action={{ icon: Plus, onClick: () => setShowAdd(true) }} />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {products.map((p) => {
          const low = p.stock <= p.threshold;
          return (
            <div key={p.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "13px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: T.inkSoft }}>{fmt(p.price)} / {p.unit}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: low ? T.terracotta : T.ink }}>{p.stock} {p.unit}{p.stock !== 1 ? "s" : ""}</div>
                {low && <div style={{ fontSize: 10, fontWeight: 700, color: T.terracotta }}>Stock faible</div>}
              </div>
            </div>
          );
        })}
      </div>
      {showAdd && <AddProductSheet onAdd={(p) => { onAdd(p); setShowAdd(false); }} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddProductSheet({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("pièce");
  const [threshold, setThreshold] = useState("");
  const canSave = name && price && stock;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,24,0.4)", zIndex: 70, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.card, width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: "18px 20px 24px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Ajouter un produit</h2>
          <button className="press" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <FieldLabel>Nom du produit</FieldLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Riz marque X" style={inputStyle} />
        <FieldLabel>Prix de vente (FCFA)</FieldLabel>
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} />
        <FieldLabel>Prix d'achat (FCFA)</FieldLabel>
        <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} />
        <FieldLabel>Quantité en stock</FieldLabel>
        <input value={stock} onChange={(e) => setStock(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} />
        <FieldLabel>Unité</FieldLabel>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle}>
          {["pièce", "boîte", "sac", "carton", "bouteille", "kg", "litre", "casier", "bidon", "autre"].map((u) => <option key={u}>{u}</option>)}
        </select>
        <FieldLabel>Seuil d'alerte</FieldLabel>
        <input value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Ex : 10" style={inputStyle} />
        <button className="press" disabled={!canSave} onClick={() => onAdd({ name, unit, price: Number(price), cost: Number(cost || 0), stock: Number(stock), threshold: Number(threshold || 5) })} style={{
          width: "100%", padding: 16, borderRadius: 14, border: "none",
          background: canSave ? T.green : T.line, color: canSave ? "#fff" : T.inkSoft, fontWeight: 800, fontSize: 15, cursor: canSave ? "pointer" : "not-allowed", marginTop: 6,
        }}>
          Ajouter le produit
        </button>
      </div>
    </div>
  );
}

// ---------- CLIENTS & DETTES ----------
function ClientsScreen({ clients, onBack, onRecordPayment }) {
  const [selected, setSelected] = useState(null);
  const [payAmount, setPayAmount] = useState("");

  if (selected) {
    return (
      <div>
        <ScreenHeader title={selected.name} onBack={() => setSelected(null)} />
        <div style={{ padding: "0 20px" }}>
          <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 18 }}>{selected.phone}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <MiniCard label="Total acheté" value={fmt(selected.totalBought)} color={T.green} />
            <MiniCard label="Il doit" value={fmt(selected.debt)} color={selected.debt > 0 ? T.gold : T.green} />
          </div>
          {selected.debt > 0 && (
            <>
              <FieldLabel>Enregistrer un paiement</FieldLabel>
              <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Montant reçu" style={inputStyle} />
              <button className="press" disabled={!payAmount} onClick={() => {
                onRecordPayment(selected.id, Number(payAmount));
                setSelected({ ...selected, debt: Math.max(0, selected.debt - Number(payAmount)) });
                setPayAmount("");
              }} style={{
                width: "100%", padding: 15, borderRadius: 14, border: "none",
                background: payAmount ? T.green : T.line, color: payAmount ? "#fff" : T.inkSoft, fontWeight: 800, fontSize: 14, cursor: payAmount ? "pointer" : "not-allowed",
              }}>
                Enregistrer le paiement
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Mes clients" onBack={onBack} />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {clients.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: T.inkSoft, fontSize: 14 }}>Aucun client enregistré pour l'instant.</div>}
        {clients.map((c) => (
          <button key={c.id} className="press" onClick={() => setSelected(c)} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left",
            background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "13px 14px", cursor: "pointer",
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: T.inkSoft }}>Achats : {fmt(c.totalBought)}</div>
            </div>
            {c.debt > 0 ? (
              <div style={{ fontSize: 12, fontWeight: 800, color: T.gold, background: T.goldSoft, padding: "4px 10px", borderRadius: 20 }}>Doit {fmt(c.debt)}</div>
            ) : (
              <ChevronRight size={16} color={T.inkSoft} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- CAISSE & DÉPENSES ----------
function CashScreen({ cashByMethod, totalCash, totalExpensesToday, onBack, onAddExpense }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div>
      <ScreenHeader title="Caisse" onBack={onBack} action={{ icon: Plus, onClick: () => setShowAdd(true) }} />
      <div style={{ padding: "0 20px" }}>
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 18, padding: 20, marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft }}>Total en caisse</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: T.ink }}>{fmt(totalCash)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          <MiniCard label="Espèces" value={fmt(cashByMethod.especes)} color={T.green} />
          <MiniCard label="MTN MoMo" value={fmt(cashByMethod.momo)} color={T.gold} />
          <MiniCard label="Orange Money" value={fmt(cashByMethod.om)} color={T.terracotta} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, marginBottom: 8 }}>Dépenses aujourd'hui : {fmt(totalExpensesToday)}</div>
      </div>
      {showAdd && <AddExpenseSheet onAdd={(cat, amt) => { onAddExpense(cat, amt); setShowAdd(false); }} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddExpenseSheet({ onAdd, onClose }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,33,24,0.4)", zIndex: 70, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.card, width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: "18px 20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Qu'avez-vous dépensé ?</h2>
          <button className="press" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <FieldLabel>Catégorie</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {EXPENSE_CATEGORIES.map((cat) => (
            <button key={cat} className="press" onClick={() => setCategory(cat)} style={{
              padding: "8px 14px", borderRadius: 20, cursor: "pointer",
              border: category === cat ? `1.5px solid ${T.terracotta}` : `1px solid ${T.line}`,
              background: category === cat ? T.terracottaSoft : T.card, color: category === cat ? T.terracotta : T.ink, fontWeight: 700, fontSize: 13,
            }}>
              {cat}
            </button>
          ))}
        </div>
        <FieldLabel>Montant (FCFA)</FieldLabel>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} />
        <button className="press" disabled={!amount} onClick={() => onAdd(category, Number(amount))} style={{
          width: "100%", padding: 16, borderRadius: 14, border: "none",
          background: amount ? T.terracotta : T.line, color: amount ? "#fff" : T.inkSoft, fontWeight: 800, fontSize: 15, cursor: amount ? "pointer" : "not-allowed", marginTop: 6,
        }}>
          Ajouter la dépense
        </button>
      </div>
    </div>
  );
}

// ---------- HISTORIQUE ----------
function HistoryScreen({ movements, onBack }) {
  return (
    <div>
      <ScreenHeader title="Historique" onBack={onBack} />
      <div style={{ padding: "0 20px" }}>
        {movements.length === 0 && <div style={{ textAlign: "center", padding: "50px 0", color: T.inkSoft, fontSize: 14 }}>Vous n'avez encore aucune vente.</div>}
        {movements.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: T.inkSoft }}>
                {m.time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {m.kind === "vente" ? paymentLabel(m.method) : "Dépense"}
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, color: m.kind === "vente" ? T.green : T.terracotta }}>
              {m.kind === "vente" ? "+" : "-"}{fmt(m.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function paymentLabel(method) {
  if (method === "especes") return "Espèces";
  if (method === "momo") return "MTN MoMo";
  if (method === "om") return "Orange Money";
  if (method === "credit") return "Crédit";
  return method;
}

// ---------- Composants partagés ----------
function ScreenHeader({ title, onBack, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="press" onClick={onBack} style={backBtnStyle}><ArrowLeft size={20} /></button>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{title}</h1>
      </div>
      {action && (
        <button className="press" onClick={action.onClick} style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: T.green, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <action.icon size={18} color="#fff" />
        </button>
      )}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 6, marginTop: 4 }}>{children}</div>;
}

function FontImports() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
      * { box-sizing: border-box; }
      button { font-family: inherit; }
      .press:active { transform: scale(0.97); }
      input, select { font-family: inherit; }
    `}</style>
  );
}

const inputStyle = {
  width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${T.line}`,
  fontSize: 14, marginBottom: 14, outline: "none", background: T.bg, color: T.ink,
};

const backBtnStyle = {
  border: "none", background: T.card, borderRadius: 10, width: 38, height: 38,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const qtyBtnStyle = {
  width: 26, height: 26, borderRadius: 8, border: `1px solid ${T.line}`, background: T.bg,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
};
