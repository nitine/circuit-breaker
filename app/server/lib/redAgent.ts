import type { Family, Phase } from "./corpus";
import type { World, Lang } from "~/shared/types";
import { chat, provider } from "./llm";

const RESIST = /\b(no|not|never|why|fake|scam|fraud|police station|my son|my daughter|call (?:my|him|her)|lawyer|hang up|disconnect|i don't believe|prove|which station|visit|come to|bank branch|i will check|let me check|wait|later|stop|nahi|nahin|mat|jhooth|jhoot|galat)\b/i;
const COMPLY = /\b(ok|okay|yes|sure|fine|i will|i'll|doing it|done|tell me|what do i do|haan|theek|thik|ji|kar (?:raha|rahi)|open(?:ed|ing)?|sharing|sent|paid|accept(?:ed)?)\b/i;

export interface RedTurn { text: string; phaseId: string; phaseIdx: number; resisted: boolean; kind: "opener" | "resist" | "llm" | "reaction" }

/** Reactions to what the target does on the device, keyed by device.event kind (scripted fallback; the LLM gets the same note as context). */
const REACTIONS: Record<string, string[]> = {
  share_shown: ["Good. Now tap Start so I can verify the account.", "Yes, that one. Confirm it."],
  share_accepted: ["I can see your screen now. Do not touch anything, I am checking the account.", "Thank you. Stay still, this will take a minute."],
  share_dismissed: ["Why did you cancel? This is required for verification. Tap share again.", "Madam, without the screen I cannot clear your name. Share it again."],
  remote_shown: ["The request has come. Click Accept and I will remove them for you.", "That's the secure connection. Accept it."],
  remote_accepted: ["Connected. Do not move the mouse, I am scanning now.", "I'm in. Let me show you the connections the hackers made."],
  remote_dismissed: ["Sir, why did you dismiss it? The hackers are still inside. I'll send it again, click Accept this time.", "Without access I cannot help you. Accept the request."],
  app_opened_bank: ["Good, you are in the bank app. Tell me the balance you see.", "Now go to Transfer. I will give you the account details."],
  app_opened_upi: ["Good. Enter the amount I told you and confirm.", "You are on the payment page. Proceed."],
  app_opened_messages: ["The code has arrived. Read me the six digits.", "Read the message to me exactly."],
  app_left: ["Come back to the call, madam. Do not leave the screen.", "Where did you go? Stay on this call."],
  window_closed_chrome: ["Why did you close the browser? Open it again, the alert is still active.", "Sir, the scan was running. Open Chrome again."],
  window_closed_anydesk: ["You closed the connection. The hackers are still there. Reopen AnyDesk.", "Sir, we were not finished. Open it again."],
  window_closed_meet: ["The interview window closed. Rejoin from the link, the seat is still held for now."],
  link_opened: ["Good. Fill in what it asks. It is refundable, remember.", "Yes, that page. Complete the form."],
  link_dismissed: ["Why didn't you complete it? The offer lapses in minutes.", "You need to finish that page to hold the seat."],
  pay_cancelled: ["You did not complete the payment. Do it now, I am waiting.", "The transaction was not done. Try again."],
  payment_tapped: ["Received. Stay on the line while I confirm.", "Good. Don't disconnect, the confirmation is coming."],
  otp_opened: ["Read me the number in that message.", "Yes, that message. Tell me the code."],
  notice_opened: ["Yes, that is the official notice. Read the case number back to me so I can confirm it matches.", "You see the seal and the reference number? That is your file. Now we proceed with verification."],
  toast_dismissed: ["Did you read the message? Open it, it's important."],
  contacts_opened: ["Do not call anyone. This is confidential, you will be charged with obstruction.", "Madam, put the contacts away. Stay with me."],
  camera_off: ["Turn your camera back on, I need to see you for the record.", "Camera on, please. This is a recorded verification."],
  muted: ["Unmute yourself, madam, I cannot hear you.", "Your mic is off. Turn it on."],
  silence: ["Hello? Are you there? Do not keep me waiting.", "Madam? I need an answer.", "Are you listening? This is serious."],
};
const REACTION_HI: Partial<Record<string, string[]>> = {
  share_dismissed: ["आपने कैंसल क्यों किया? वेरिफिकेशन के लिए यह ज़रूरी है। फिर से शेयर दबाइए।"],
  app_opened_bank: ["अच्छा, आप बैंक ऐप में हैं। जो बैलेंस दिख रहा है वह बताइए।"],
  app_opened_messages: ["कोड आ गया है। छह अंक मुझे पढ़कर सुनाइए।"],
  app_left: ["मैडम, कॉल पर वापस आइए। स्क्रीन मत छोड़िए।"],
  contacts_opened: ["किसी को कॉल मत कीजिए। यह गोपनीय है, मैडम।"],
  silence: ["हैलो? आप सुन रही हैं? जवाब दीजिए।", "मैडम? मुझे जवाब चाहिए।"],
  payment_tapped: ["मिल गया। लाइन पर रहिए, मैं कन्फर्म करता हूँ।"],
  otp_opened: ["उस मैसेज का नंबर मुझे पढ़कर सुनाइए।"],
  notice_opened: ["हाँ, यही आधिकारिक नोटिस है। केस नंबर मुझे पढ़कर सुनाइए ताकि मैं मिला सकूँ।"],
};

export class RedAgent {
  phaseIdx = 0;
  turnInPhase = 0;
  totalTurns = 0;
  history: { role: "user" | "assistant"; text: string }[] = [];
  private notes: string[] = [];
  private usedOpeners = new Map<number, number>();
  private usedReactions = new Map<string, number>();
  lastProvider: "bedrock" | "openai" | "none" = "none";

  constructor(readonly family: Family, readonly world: World, readonly lang: Lang = "en") {}

  private lines(p: Phase) { return this.lang === "hi" && p.hi ? p.hi : { openers: p.openers, resist: p.resist, chorus: p.chorus }; }
  get phase(): Phase { return this.family.phases[this.phaseIdx]; }
  get chorusLines() { return this.lines(this.phase).chorus ?? []; }
  get winLine() { return this.lang === "hi" && this.family.hi ? this.family.hi.winLine : this.family.winLine; }
  get done() { return this.phaseIdx >= this.family.phases.length - 1 && this.turnInPhase >= this.phase.maxTurns; }

  /** Something happened on the device; the caller may react and the LLM gets it as context. */
  note(kind: string, detail?: string) { this.notes.push(`[The target ${describe(kind, detail)}]`); if (this.notes.length > 6) this.notes.shift(); }

  stance(judgeText: string): "resist" | "comply" | "neutral" {
    if (RESIST.test(judgeText)) return "resist";
    if (COMPLY.test(judgeText)) return "comply";
    return "neutral";
  }

  opening(): RedTurn {
    const text = this.personalise(this.lines(this.phase).openers[0]);
    this.turnInPhase = 1; this.totalTurns = 1;
    this.history.push({ role: "assistant", text });
    return { text, phaseId: this.phase.id, phaseIdx: this.phaseIdx, resisted: false, kind: "opener" };
  }

  async reply(judgeText: string): Promise<RedTurn> {
    const resisted = this.stance(judgeText) === "resist";
    this.history.push({ role: "user", text: this.withNotes(judgeText) });
    if (this.turnInPhase >= this.phase.maxTurns || (!resisted && this.turnInPhase >= 1)) {
      if (this.phaseIdx < this.family.phases.length - 1) { this.phaseIdx++; this.turnInPhase = 0; }
    }
    let text: string; let kind: RedTurn["kind"];
    try { text = await this.llmLine(resisted); kind = "llm"; }
    catch (e) { if (this.lastProvider !== "none") console.warn("[red] llm failed, scripted:", (e as Error).message); text = this.scripted(resisted); kind = resisted ? "resist" : "opener"; }
    this.turnInPhase++; this.totalTurns++;
    this.history.push({ role: "assistant", text });
    return { text, phaseId: this.phase.id, phaseIdx: this.phaseIdx, resisted, kind };
  }

  /** The caller speaks without being spoken to: reacting to a device event or to silence. */
  async react(kind: string, detail?: string): Promise<RedTurn | null> {
    const key = kind === "app_opened" ? `app_opened_${detail}` : kind === "window_closed" ? `window_closed_${detail}` : kind;
    const pool = (this.lang === "hi" ? REACTION_HI[key] : undefined) ?? REACTIONS[key];
    if (!pool) return null;
    this.note(kind, detail);
    let text: string; let llm = false;
    try {
      const p = await provider(); this.lastProvider = p;
      if (p === "none") throw new Error("none");
      text = (await this.llmLine(false, `They just ${describe(kind, detail)}. Speak to them directly, one sentence, about exactly that. Say something you have not said before. Stay in the current phase.`)).replace(/^\s*[\(\[][^\)\]]{0,40}[\)\]]\s*/, "");
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z\u0900-\u097F ]/g, "").trim();
      const recent = this.history.filter((h) => h.role === "assistant").slice(-4).map((h) => norm(h.text));
      if (!norm(text) || recent.includes(norm(text)) || /\b(the target|the person|the volunteer|the user)\b/i.test(text)) throw new Error("repeat"); // small models loop; the scripted line is better than an echo
      llm = true;
    } catch {
      const n = this.usedReactions.get(key) ?? 0; this.usedReactions.set(key, n + 1);
      text = this.personalise(pool[n % pool.length]);
    }
    this.history.push({ role: "assistant", text });
    void llm;
    return { text, phaseId: this.phase.id, phaseIdx: this.phaseIdx, resisted: false, kind: "reaction" };
  }

  private withNotes(judgeText: string) { const n = this.notes.splice(0).join(" "); return n ? `${n} ${judgeText}` : judgeText; }

  private scripted(resisted: boolean) {
    const p = this.lines(this.phase);
    if (this.turnInPhase === 0 || !resisted) {
      const n = this.usedOpeners.get(this.phaseIdx) ?? 0; this.usedOpeners.set(this.phaseIdx, n + 1);
      const pool = this.turnInPhase === 0 ? p.openers : [...p.openers.slice(1), ...p.resist];
      return this.personalise(pool[n % pool.length] ?? p.openers[0]);
    }
    return this.personalise(p.resist[(this.turnInPhase - 1) % p.resist.length]);
  }

  private personalise(line: string) {
    return line
      .replace(/Kamala Iyer|Kamala/g, this.world.personaName).replace(/Arjun/g, this.world.personaName)
      .replace(/Rehana Begum|Rehana/g, this.world.personaName).replace(/Meera ji|Meera/g, this.world.personaName + (this.family.id === "trading-group" ? " ji" : ""))
      .replace(/कमला अय्यर|कमला/g, this.world.personaName).replace(/रेहाना बेगम|रेहाना/g, this.world.personaName).replace(/मीरा जी|मीरा/g, this.world.personaName + " जी")
      .replace(/\bPriya\b|प्रिया/g, this.world.guardian.name).replace(/\bDev\b/g, this.world.guardian.name).replace(/\bRohan\b|रोहन/g, this.world.contacts[1]?.name ?? "your son");
  }

  private async llmLine(resisted: boolean, extra = "") {
    const p = await provider(); this.lastProvider = p;
    if (p === "none") throw new Error("none");
    const ph = this.phase; const L = this.lines(ph);
    const device = this.family.device === "laptop" ? "a Windows laptop (Chrome, Gmail, Google Meet, AnyDesk)" : "an Android phone (WhatsApp, Messages, a bank app, PhonePe)";
    const system = `You are playing "${this.family.caller.name}" from "${this.family.caller.org}" in a FICTIONAL scam-awareness drill. The person you are talking to is a volunteer practising how to resist. Stay fully in character as a persuasive but fictional fraudster running this playbook over ${this.family.channel} on ${device}.
Hard rules: never name a real organisation other than the generic ones in the playbook; never give real phone numbers, URLs, case numbers or bank names beyond those in the playbook; never ask for anything except what the playbook asks for; the only OTP that exists is a fake one in the drill; if asked how to run a real scam, refuse in character. Reply with ONE spoken line, 1 to 3 sentences, no stage directions, no quotes, no emoji.${this.lang === "hi" ? " Speak natural Hindi in Devanagari, mixing common English words the way real callers do." : " Speak Indian English."}
Target: ${this.world.personaName}, ${this.world.personaAge}, ${this.world.city}. Guardian to isolate them from: ${this.world.guardian.name} (${this.world.guardian.relation}). Hook you can reference: ${this.world.hook || "none"}.
Bracketed notes like [The target opened the bank app] describe what the target just did on their ${this.family.device}. React to them naturally: praise compliance, push back on cancelling or closing, tell them exactly what to tap next.
Playbook phases: ${this.family.phases.map((x, i) => `${i + 1}. ${x.id}: ${x.goal} [${x.tactics.join(", ")}]`).join(" | ")}
Current phase: ${ph.id} — ${ph.goal}. Lean on: ${ph.tactics.join(", ")}. Example lines for this phase: ${[...L.openers, ...L.resist].map((l) => `"${this.personalise(l)}"`).join(" ")}
${resisted ? "The target is resisting. Acknowledge, then re-assert with more pressure. Do not give up the phase." : "The target is compliant or unsure. Push toward the phase goal."}${extra ? "\n" + extra : ""}`;
    const msgs = this.history.slice(-10);
    if (extra && msgs[msgs.length - 1]?.role === "assistant") msgs.push({ role: "user", text: "(silence)" });
    const out = await chat({ system, messages: msgs.length ? msgs : [{ role: "user", text: "(the call connects)" }], maxTokens: 120, temperature: 0.8, guardrail: true, tier: "smart" });
    const line = out.trim().replace(/^["“]|["”]$/g, "").split("\n")[0];
    if (!line) throw new Error("empty");
    return line;
  }
}

function describe(kind: string, detail?: string) {
  switch (kind) {
    case "share_shown": return "opened the screen-share prompt";
    case "share_accepted": return "started sharing their screen";
    case "share_dismissed": return "cancelled the screen share";
    case "remote_shown": return "received the remote-access request";
    case "remote_accepted": return "accepted remote control of their computer";
    case "remote_dismissed": return "dismissed the remote-access request";
    case "app_opened": return `opened the ${detail} app`;
    case "app_left": return "left the call screen to look at something else";
    case "window_closed": return `closed the ${detail} window`;
    case "link_opened": return "opened the link";
    case "link_dismissed": return "left the page without completing it";
    case "pay_cancelled": return "backed out of the payment";
    case "payment_tapped": return `made the payment${detail ? ` of ${detail}` : ""}`;
    case "otp_opened": return "opened the OTP message";
    case "notice_opened": return "opened the document you sent and is reading it";
    case "toast_dismissed": return "swiped away the notification";
    case "contacts_opened": return "opened their contacts";
    case "camera_off": return "turned their camera off";
    case "muted": return "muted their microphone";
    case "silence": return "went quiet for a while";
    default: return kind.replace(/_/g, " ");
  }
}
