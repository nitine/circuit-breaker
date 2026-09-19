import type { World } from "~/shared/types";
import type { Persona, Family } from "./corpus";
import { cfg, features } from "./config";
import { converse } from "./aws";

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
  return {
    personaName: name,
    personaAge: age,
    city,
    contacts,
    guardian: { ...guardian, number: num(1) },
    smsThreads,
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
  if (!features().bedrock) return base;
  const context = persona?.context ?? personaText ?? "";
  const system = `You build the phone of a fictional person for a scam-awareness drill. Output ONLY a JSON object, no prose. Keys: personaName (string), personaAge (number), city (string), contacts (array of 8 objects {name, number, relation?}; the FIRST contact must be the guardian), guardian ({name, relation, label}), smsThreads (array of 4 objects {sender, messages:[{from:"them"|"me", text, ts ISO}]}; include exactly one thread that is the hook: ${JSON.stringify(family.hookSms ?? family.notifications[0] ?? {})}), bank ({name:"Bharat Bank", masked, balance number, txns:[{desc, amount, ts}] x5}). Numbers are Indian mobile numbers with X for the last digits. Money in INR. Keep everything plausible for this person. Never use real bank brands other than "Bharat Bank".`;
  try {
    const out = await converse({ modelId: cfg.analystModel, system, messages: [{ role: "user", text: `Person: ${context}\nCase family: ${family.label}` }], maxTokens: 1500, temperature: 0.6 });
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    return {
      ...base,
      personaName: json.personaName ?? base.personaName,
      personaAge: json.personaAge ?? base.personaAge,
      city: json.city ?? base.city,
      contacts: Array.isArray(json.contacts) && json.contacts.length ? json.contacts : base.contacts,
      guardian: json.guardian ? { ...base.guardian, ...json.guardian } : base.guardian,
      smsThreads: Array.isArray(json.smsThreads) && json.smsThreads.length ? json.smsThreads : base.smsThreads,
      bank: json.bank ? { ...base.bank, ...json.bank } : base.bank,
    };
  } catch (e) {
    console.warn("[world] bedrock world failed, using template:", (e as Error).message);
    return base;
  }
}
