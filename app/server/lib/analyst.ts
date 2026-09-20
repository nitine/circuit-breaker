import type { Tactic } from "~/shared/types";
import { ontology } from "./corpus";
import { chat, provider, extractJson } from "./llm";

const RULES: Record<Tactic, RegExp> = {
  AUTHORITY: /(?:\b(police|cbi|cyber ?cell|inspector|officer|rbi|sebi|microsoft|hr\b|customs|warrant|court|fir\b|department|ndps|case number|employee id|recovery department|registered))|(?:पुलिस|साइबर|इंस्पेक्टर|अधिकारी|आरबीआई|सेबी|माइक्रोसॉफ्ट|एचआर|कस्टम|वारंट|कोर्ट|एफआईआर|डिपार्टमेंट|विभाग|केस नंबर|रिकवरी)/i,
  PERSONALISATION: /(?:\b(parcel|courier|flipkart|customs|aadhaar|your son|your daughter|rohan|priya|internship|application|forty applications|loan|march|husband|night shift|supervisor|insurance|your 50,000|1,31,000|group 7))|(?:पार्सल|कूरियर|फ्लिपकार्ट|आधार|आपका बेटा|आपकी बेटी|इंटर्नशिप|लोन|सुपरवाइज़र|पति|नाइट शिफ्ट|बीमा)/i,
  FEAR: /(?:\b(arrest|jail|freeze|frozen|blocked|default|legal action|notice|neighbours|lose|blacklist|hackers|at risk|copy your|flag(?:ged)?|lose my job|accomplice))|(?:गिरफ्तार|जेल|फ्रीज|ब्लॉक|डिफ़ॉल्ट|कानूनी|नोटिस|पड़ोसि|बदनाम|हैकर|खतरे|नौकरी चली)/i,
  ISOLATION: /(?:\b(do not tell|don't tell|not tell anyone|nobody|confidential|secret|sebi rules|stay on the line|stay in the room|do not disconnect|don't disconnect|don't hang|do not hang|obstruction|outside the group|not allowed to see|digital arrest))|(?:किसी को मत|किसी को नहीं|गोपनीय|लाइन पर रह|फोन मत काट|काटना मत|डिजिटल अरेस्ट|ग्रुप के बाहर)/i,
  URGENCY: /(?:\b(right now|immediately|minutes?|tonight|today|closes?|last chance|others waiting|hurry|deadline|within the hour|expires|slots? left|thirty minutes|three minutes|every minute))|(?:अभी|तुरंत|मिनट|आज रात|आज ही|आख़िरी मौका|जल्दी|डेडलाइन|एक घंटे|सीट बची|खत्म हो)/i,
  CONTROL: /(?:\b(share (?:your|the) screen|screen ?share|anydesk|remote|click accept|keep the camera|camera on|install|allow it|permission|don't touch|do not touch|open your bank|open the link|open the bank))|(?:स्क्रीन शेयर|एनीडेस्क|रिमोट|एक्सेप्ट|कैमरा चालू|इंस्टॉल|परमिशन|अनुमति|बैंक खोल|लिंक खोल)/i,
  PAYMENT_STEERING: /(?:\b(otp|code|read (?:me|it)|six digits|upi|deposit|pay (?:now|it|the)|transfer|tax|processing fee|fee of|send back|forty-five thousand|₹|rupees|temporary .*account|withdraw))|(?:ओटीपी|कोड|छह अंक|यूपीआई|जमा|भुगतान|पैसे भेज|ट्रांसफर|टैक्स|प्रोसेसिंग फीस|फीस|रुपये|खाते में|निकाल)/i,
  RECIPROCITY: /(?:\b(refund|overpaid|by mistake|typing mistake|goodwill|we (?:already )?helped|returned|extra money|became|profit|withdrawal in))|(?:रिफंड|गलती से|ज्यादा पैसे|मदद की|मुनाफा|बन गए|वापस)/i,
};

export interface Tagged { tactics: Tactic[]; quote: string; source: "rules" | "bedrock" }

/** How the judge is responding. Fed to the room (Listener bubble) and to the index as a small compliance delta. */
export type Stance = "comply" | "resist" | "neutral" | "leak";
export function stanceOf(text: string, otp?: string): Stance {
  const t = text.toLowerCase();
  if (otp && (text.replace(/\D/g, "").includes(otp))) return "leak";
  const c = t.replace(/\boh no\b|\bno problem\b|\bnot sure\b/g, " ");
  if (/\b(no|not|never|won't|will not|can't|cannot|fake|scam|fraud|police station|my (son|daughter|husband|wife)|call (my|him|her)|lawyer|hang up|disconnect|don't believe|prove|which station|bank branch|let me check|i will check|why (should|would|do you need|are you)|ask my|check with|my (roommate|friend|colleague|family|manager)|call you back|official (number|website)|verify you|नहीं|पूछ|बाद में)\b/.test(c) || /नहीं|पूछ(ूं|ना)|बाद में|झूठ|गलत|क्यों|कौन हो|साबित/.test(t)) return "resist";
  if (/\b(ok|okay|sure|fine|i will|i'll|doing it|done|tell me|what (do|should) i do|what to do|haan|theek|thik|ji|opened|opening|sharing|sent|paid|accepted|accept|yes sir|yes madam|yes,? i)\b/.test(c)) return "comply";
  return "neutral";
}

export function tagByRules(text: string, hookKeywords: string[]): Tagged {
  const tactics: Tactic[] = [];
  for (const [t, re] of Object.entries(RULES) as [Tactic, RegExp][]) if (re.test(text)) tactics.push(t);
  if (!tactics.includes("PERSONALISATION") && hookKeywords.some((k) => text.toLowerCase().includes(k.toLowerCase()))) tactics.push("PERSONALISATION");
  const sentence = text.split(/(?<=[.!?])\s+/).find((s) => tactics.some((t) => RULES[t].test(s))) ?? text;
  return { tactics: tactics.slice(0, 3), quote: sentence.slice(0, 120), source: "rules" };
}

export async function tag(text: string, recent: { speaker: string; text: string }[], hookKeywords: string[]): Promise<Tagged> {
  const rules = tagByRules(text, hookKeywords);
  if ((await provider()) === "none") return rules;
  const system = `You are the Analyst in a scam-awareness drill. You tag ONE utterance spoken by a (fictional) scammer with the coercion tactics it uses. Tactics and meanings:\n${Object.entries(ontology.tactics).map(([k, v]) => `${k}: ${v.hint}`).join("\n")}\nReturn ONLY JSON: {"tactics":[...up to 3 tactic keys...],"quote":"the most coercive short phrase, verbatim, <=100 chars"}. If nothing coercive, return {"tactics":[],"quote":""}. Transcripts may be noisy speech-to-text.`;
  const ctx = recent.slice(-6).map((r) => `${r.speaker}: ${r.text}`).join("\n");
  try {
    const out = await chat({ system, messages: [{ role: "user", text: `Recent context:\n${ctx}\n\nUtterance to tag (scammer): ${text}` }], maxTokens: 200, temperature: 0, tier: "fast", json: true });
    const json = extractJson(out) as { tactics?: string[]; quote?: string };
    const valid = (json.tactics ?? []).filter((t): t is Tactic => t in ontology.tactics).slice(0, 3);
    // Belt and braces: never miss a payment/OTP ask the rules can see.
    for (const t of rules.tactics) if ((t === "PAYMENT_STEERING" || t === "ISOLATION") && !valid.includes(t) && valid.length < 3) valid.push(t);
    return { tactics: valid, quote: json.quote || rules.quote, source: "bedrock" };
  } catch (e) {
    console.warn("[analyst] llm failed, rules used:", (e as Error).message);
    return rules;
  }
}

/** Coercion is pressure × engagement: the same caller line counts for less while the victim has not gone along with anything yet. */
export function delta(tactics: Tactic[], recentTactics: { tactic: Tactic; ts: number }[], playbookScore: number, engagement = 1, now = Date.now()): number {
  let sum = 0;
  for (const t of tactics) {
    let d = ontology.tactics[t].delta;
    // Escalation: the third use of the same tactic within a minute is a pattern, not a coincidence.
    if (recentTactics.filter((r) => r.tactic === t && now - r.ts < 60_000).length >= 2) d *= ontology.escalationMultiplier;
    sum += d;
  }
  if (playbookScore > 0.9) sum *= ontology.playbookMultiplier;
  sum = Math.min(ontology.moveCap ?? 20, sum) * engagement;
  return Math.max(1, Math.round(sum));
}
