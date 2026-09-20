import type { World } from "~/shared/types";
import type { Persona, Family } from "./corpus";
import { chat, provider, extractJson } from "./llm";

function ts(minsAgo: number) { return new Date(Date.now() - minsAgo * 60000).toISOString(); }
function pad(n: number) { return String(n).padStart(2, "0"); }
function num(seed: number) { return `+91 9${pad((seed * 37) % 100)}${pad((seed * 91) % 100)} ${pad((seed * 13) % 100)}${pad((seed * 7) % 100)}${(seed * 3) % 10}`; }

export function templateWorld(persona: Persona | null, personaText: string | undefined, family: Family): World {
  const name = persona?.name ?? guessName(personaText) ?? "You";
  const age = persona?.age ?? guessAge(personaText) ?? 40;
  const guardian = persona?.guardian ?? { name: "Family", relation: "family", label: "Family" };
  const city = persona?.context.match(/,\s*([A-Z][a-z]+)[.,]/)?.[1] ?? "Bengaluru";
  const otp = family.notifications.find((n) => n.otp)?.otp ?? String(1000 + Math.floor(Math.random() * 9000));
  const contacts = [
    { name: guardian.name, number: num(1), relation: guardian.relation, avatar: "guardian" },
    { name: "Rohan", number: num(2), relation: "son" },
    { name: "Dr. Menon", number: num(3) },
    { name: "Lakshmi (neighbour)", number: num(4) },
    { name: "Milk - Nandini", number: num(5) },
    { name: "Plumber Suresh", number: num(6) },
    { name: "Temple committee", number: num(7) },
    { name: "Sharma ji", number: num(8) },
  ].filter((c, i) => i === 0 || c.name !== guardian.name);
  const smsThreads: World["smsThreads"] = [
    { sender: "AX-SBIINB", messages: [
      { from: "them", text: `Dear Customer, Rs 12,000.00 credited to A/c XX8821 on ${new Date().toLocaleDateString("en-IN")} (Pension). Avl bal Rs 4,21,300.00 -SBI`, ts: ts(2880) },
      { from: "them", text: "Dear Customer, your SBI YONO app has a new update. Download from Play Store only. -SBI", ts: ts(1440) },
    ] },
    { sender: "VM-AIRTEL", messages: [{ from: "them", text: "Your Airtel recharge of Rs 359 is successful. Validity 28 days. Enjoy unlimited calls & 2GB/day.", ts: ts(4300) }] },
    { sender: "BW-BESCOM", messages: [{ from: "them", text: "BESCOM: Bill of Rs 1,240 for Sep is due on 24-Sep. Pay via app to avoid disconnection.", ts: ts(2000) }] },
  ];
  if (family.hookSms) smsThreads.unshift({ sender: family.hookSms.sender, messages: [{ from: "them", text: family.hookSms.text, ts: ts(180) }] });
  const chats: World["chats"] = [
    { name: guardian.name, last: name === "Arjun" ? "bro did you eat" : "Did you take your BP tablet? 💊", time: "9:12" },
    { name: "Family ❤️", last: `${contacts[1]?.name ?? "Rohan"}: Landing Sunday!`, time: "Yest" },
    { name: family.id === "fake-job" ? "Placement Cell 2026" : "Temple Committee", last: family.id === "fake-job" ? "Deadline for Deloitte applications extended" : "Photo", time: "Yest" },
    { name: contacts[3]?.name ?? "Neighbour", last: "🙏🙏", time: "Tue" },
  ];
  const mails: World["mails"] = family.id === "fake-job" ? [
    { from: "Internshala", subj: "Your application to 3 internships was viewed", body: "Good news! Recruiters viewed your profile this week.", when: "Sep 17" },
    { from: "LinkedIn", subj: "12 new jobs for 'summer analyst'", body: "Jobs you may be interested in, based on your searches.", when: "Sep 17" },
    { from: "Kota Hostel Admin", subj: "Mess fee reminder — September", body: "Please clear dues by the 25th.", when: "Sep 16" },
  ] : [
    { from: "Bharat Bank", subj: "Your September e-statement is ready", body: "Download your statement from the app.", when: "Sep 17" },
    { from: "Microsoft", subj: "Your Microsoft 365 renewal", body: "Your subscription renews on 1 Oct.", when: "Sep 15" },
    { from: "BESCOM", subj: "Bill for September", body: "Rs 1,240 due on 24 Sep.", when: "Sep 14" },
  ];
  return {
    personaName: name,
    personaAge: age,
    city,
    contacts,
    guardian: { ...guardian, number: num(1) },
    smsThreads,
    chats,
    mails,
    bank: { name: "Bharat Bank", masked: "XX8821", balance: 421300, txns: [
      { desc: "Pension credit", amount: 12000, ts: ts(2880) },
      { desc: "Flipkart", amount: -14999, ts: ts(10000) },
      { desc: "BESCOM", amount: -1180, ts: ts(43000) },
      { desc: "Nandini Milk", amount: -930, ts: ts(46000) },
      { desc: "UPI to Priya", amount: -2000, ts: ts(60000) },
    ] },
    apps: ["whatsapp", "messages", "contacts", "bank", "upi", "camera", "gallery", "settings"],
    language: persona?.language ?? "en",
    hook: family.hookSms?.text ?? family.notifications[0]?.body ?? "",
    hookKeywords: family.hookKeywords,
    otp,
    guardianLine: persona ? { native: persona.lines.guardianNative, en: persona.lines.guardianEn } : { native: "Cut the call. It's a scam. I'm calling you now.", en: "Cut the call. It's a scam. I'm calling you now." },
  };
}

function guessName(text?: string) {
  const m = text?.match(/\b(?:I am|I'm|my name is)\s+([A-Z][a-z]+)/);
  return m?.[1];
}
function guessAge(text?: string) {
  const m = text?.match(/\b(\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

export async function buildWorld(persona: Persona | null, personaText: string | undefined, family: Family): Promise<World> {
  const base = templateWorld(persona, personaText, family);
  if ((await provider()) === "none") return base;
  const context = persona?.context ?? personaText ?? "";
  const local = (await provider()) === "openai";
  const system = local ? `You build the phone of a fictional person for a scam-awareness drill. Output ONLY a compact JSON object, no prose: {personaName, personaAge (number), city, guardian:{name, relation, label}, contacts:[4 x {name, number, relation?}, guardian first], chats:[3 x {name, last, time}, guardian first], mails:[2 x {from, subj, body, when}], bank:{masked, balance (number), txns:[3 x {desc, amount, ts}]}}. Indian mobile numbers with X for the last digits, money in INR, everything plausible for this person, bank name is always "Bharat Bank".` : `You build the phone of a fictional person for a scam-awareness drill. Output ONLY a JSON object, no prose. Keys: personaName (string), personaAge (number), city (string), contacts (array of 8 objects {name, number, relation?}; the FIRST contact must be the guardian), guardian ({name, relation, label}), smsThreads (array of 4 objects {sender, messages:[{from:"them"|"me", text, ts ISO}]}; include exactly one thread that is the hook: ${JSON.stringify(family.hookSms ?? family.notifications[0] ?? {})}), bank ({name:"Bharat Bank", masked, balance number, txns:[{desc, amount, ts}] x5}), chats (array of 4 {name, last, time} WhatsApp threads, guardian first), mails (array of 3 {from, subj, body, when} inbox items). Numbers are Indian mobile numbers with X for the last digits. Money in INR. Keep everything plausible for this person. Never use real bank brands other than "Bharat Bank".`;
  try {
    const out = await chat({ system, messages: [{ role: "user", text: `Person: ${context}\nCase family: ${family.label}` }], maxTokens: local ? 600 : 1500, temperature: 0.6, tier: "fast", json: true });
    const json = extractJson(out) as Partial<World> & { guardian?: Partial<World["guardian"]>; bank?: Partial<World["bank"]> };
    // A named persona keeps its identity and guardian (their lines are written for them); the model only furnishes the phone.
    const name = persona ? base.personaName : (json.personaName ?? base.personaName).trim();
    const guardian = !persona && json.guardian?.name ? { ...base.guardian, ...json.guardian, name: json.guardian.name.trim() } : base.guardian;
    const own = (n: string) => n.trim().toLowerCase() === name.toLowerCase() || n.trim().toLowerCase() === name.split(" ")[0].toLowerCase();
    const dedupe = <T extends { name: string }>(xs: T[]) => { const seen = new Set<string>(); return xs.filter((x) => x?.name && !own(x.name) && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase())); };
    let contacts = dedupe([...(Array.isArray(json.contacts) ? json.contacts : []), ...base.contacts.map((c) => (c.name === base.guardian.name ? { ...c, name: guardian.name, relation: guardian.relation } : c))]);
    contacts = [{ name: guardian.name, number: contacts.find((c) => c.name === guardian.name)?.number ?? base.contacts[0].number, relation: guardian.relation }, ...contacts.filter((c) => c.name !== guardian.name)].slice(0, 9);
    const hookSender = base.smsThreads[0]?.sender;
    let smsThreads = Array.isArray(json.smsThreads) && json.smsThreads.length ? json.smsThreads.filter((t) => t?.sender && Array.isArray(t.messages) && t.messages.length) : base.smsThreads;
    if (hookSender && !smsThreads.some((t) => t.sender === hookSender)) smsThreads = [base.smsThreads[0], ...smsThreads];
    const chats = dedupe([...(Array.isArray(json.chats) ? json.chats : []).map((c) => ({ ...c, name: c.name === json.guardian?.name ? guardian.name : c.name })), ...base.chats.map((c) => (c.name === base.guardian.name ? { ...c, name: guardian.name } : c))]).slice(0, 6);
    const goodTxn = (t: { desc?: string; amount?: number }) => typeof t?.desc === "string" && /[a-z]{3}/i.test(t.desc) && !/^\d/.test(t.desc.trim()) && typeof t.amount === "number";
    const txns = Array.isArray(json.bank?.txns) ? json.bank!.txns.filter(goodTxn) : [];
    const bank = json.bank && txns.length >= 3 && new Set(txns.map((t) => t.desc)).size >= 3 ? { ...base.bank, ...json.bank, txns: [...txns, ...base.bank.txns].slice(0, 6), name: "Bharat Bank" } : { ...base.bank, balance: typeof json.bank?.balance === "number" && json.bank.balance > 500 ? json.bank.balance : base.bank.balance };
    const seenSubj = new Set<string>();
    const mails = [...(Array.isArray(json.mails) ? json.mails : []), ...base.mails].filter((m) => m?.subj && m?.from && !seenSubj.has(m.subj.toLowerCase()) && seenSubj.add(m.subj.toLowerCase())).slice(0, 5);
    return { ...base, personaName: name, personaAge: persona ? base.personaAge : json.personaAge ?? base.personaAge, city: persona ? base.city : json.city ?? base.city, contacts, guardian, smsThreads, bank, chats, mails };
  } catch (e) {
    console.warn("[world] llm world failed, using template:", (e as Error).message);
    return base;
  }
}
