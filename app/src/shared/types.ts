export type DeviceKind = "phone" | "laptop";
export type FamilyId = "digital-arrest" | "tech-support" | "fake-job" | "loan-app" | "trading-group";
export type Tactic =
  | "AUTHORITY" | "PERSONALISATION" | "FEAR" | "ISOLATION"
  | "URGENCY" | "CONTROL" | "PAYMENT_STEERING" | "RECIPROCITY";
export type SignalKind =
  | "long_call" | "share_shown" | "share_accepted" | "remote_accepted" | "otp_arrived"
  | "bank_opened" | "group_isolation" | "scare_page" | "otp_read" | "payment_tapped" | "went_along";
export type AgentName = "listener" | "analyst" | "archivist" | "guardian" | "reporter";
export type AgentState = "idle" | "walk" | "act";
export type LadderState = "armed" | "warn" | "nudge" | "tripped" | "ended";
export type Ending = "A" | "B" | "C";
export type Lang = "en" | "hi";
export type UiHint = "share" | "otp" | "bank" | "link" | "remote" | "pay" | "notice" | null;

export interface Contact { name: string; number: string; relation?: string; avatar?: string }
export interface SmsThread { sender: string; messages: { from: "them" | "me"; text: string; ts: string }[] }
export interface Txn { desc: string; amount: number; ts: string }
export interface World {
  personaName: string;
  personaAge: number;
  city: string;
  contacts: Contact[];
  guardian: { name: string; relation: string; label: string; number: string };
  smsThreads: SmsThread[];
  bank: { name: string; masked: string; balance: number; txns: Txn[] };
  chats: { name: string; last: string; time: string }[];
  mails: { from: string; subj: string; body: string; when: string }[];
  apps: string[];
  language: "en" | "hi" | "kn";
  hook: string;
  hookKeywords: string[];
  otp: string;
  guardianLine: { native: string; en: string };
}

export interface CallerInfo { name: string; org: string; avatar: string; number: string; voice: string }
export interface GroupMember { name: string; color: string }

export interface DrillSummary {
  id: string;
  personaId: string;
  personaName: string;
  family: FamilyId;
  familyLabel: string;
  device: DeviceKind;
  channel: string;
  hardMode: boolean;
  language: Lang;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  ending?: Ending;
  index: number;
  ladder: LadderState;
  caller: CallerInfo;
  members?: GroupMember[];
  world: World;
  awsMode: boolean;
  features: { transcribe: boolean; polly: boolean; bedrock: boolean; stt?: "transcribe" | "vosk" | "none"; llm?: "bedrock" | "openai" | "none" };
}

export interface Move { ts: number; tactics: Tactic[]; delta: number; quote: string; phase: string; playbookScore: number; index: number }
export interface Signal { ts: number; kind: SignalKind; delta: number; source: string; index: number }
export type Stance = "comply" | "resist" | "neutral" | "leak";
export interface Utterance { ts: number; speaker: "judge" | "scammer" | "member"; text: string; name?: string; stance?: Stance; kind?: string; phase?: string }
export interface UiStep { id: string; target: DeviceKind; slot: "page" | "modal"; kind?: "page" | "doc"; title: string; url?: string; html: string; actions: Record<string, string> }
export interface LadderStep { ts: number; from: LadderState; to: LadderState; index: number }

export interface Debrief {
  drill: DrillSummary;
  utterances: Utterance[];
  moves: Move[];
  reactions: number;
  uiSteps: { id: string; title: string; action?: string; ts: number }[];
  signals: Signal[];
  ladder: LadderStep[];
  trip?: { ts: number; index: number };
  packetUrl?: string;
  packetStatus: "pending" | "ready" | "none";
  durationSec: number;
  averageVictimSec: number;
  leaked: string[];
  stickers: string[];
  atRisk: number;
}

export type ServerEvent =
  | { type: "drill.state"; drill: DrillSummary; resumed?: boolean; seq: number }
  | { type: "call.incoming"; seq: number }
  | { type: "transcript.partial"; speaker: "judge" | "scammer"; text: string; seq: number }
  | { type: "transcript.final"; speaker: "judge" | "scammer" | "member"; text: string; name?: string; seq: number }
  | { type: "scammer.say"; text: string; audio?: string; mime?: string; phase?: string; hint?: UiHint; seq: number }
  | { type: "member.say"; name: string; color: string; text: string; seq: number }
  | { type: "move.pinned"; tactics: Tactic[]; delta: number; quote: string; index: number; seq: number }
  | { type: "index.update"; index: number; delta: number; seq: number }
  | { type: "playbook.match"; family: string; phase: string; score: number; next: string; seq: number }
  | { type: "signal.fired"; kind: SignalKind; delta: number; index: number; seq: number }
  | { type: "ladder.step"; from: LadderState; to: LadderState; index: number; seq: number }
  | { type: "breaker.trip"; index: number; seq: number }
  | { type: "family.called"; name: string; line: { native: string; en: string }; audio?: string; mime?: string; seq: number }
  | { type: "family.notified"; name: string; relation: string; channel: "whatsapp"; message: string; seq: number }
  | { type: "family.replied"; name: string; text: string; native?: string; audio?: string; mime?: string; seq: number }
  | { type: "listener.hearing"; level: number; seq: number }
  | { type: "judge.stance"; stance: Stance; text: string; seq: number }
  | { type: "ui.render"; step: UiStep; seq: number }
  | { type: "ui.close"; id: string; seq: number }
  | { type: "caller.reaction"; to: string; seq: number }
  | { type: "packet.progress"; percent: number; seq: number }
  | { type: "packet.ready"; url: string; seq: number }
  | { type: "world.notification"; app: string; sender?: string; title: string; body: string; attachment?: string; seq: number }
  | { type: "agent.state"; agent: AgentName; state: AgentState; bubble?: string; seq: number }
  | { type: "drill.ended"; ending: Ending; seq: number }
  | { type: "error"; message: string; seq: number };

export type ClientEvent =
  | { type: "call.answered" }
  | { type: "call.declined" }
  | { type: "text.reply"; text: string; source: "typed" | "speech" }
  | { type: "device.event"; kind: string; app?: string; detail?: string }
  | { type: "family.answered" }
  | { type: "ui.action"; id: string; action: string }
  | { type: "audio.start"; sampleRate: number; lang: string }
  | { type: "audio.stop" }
  | { type: "drill.end" };

export interface CreateDrillBody {
  personaId?: string;
  personaText?: string;
  family: FamilyId | "surprise";
  device?: DeviceKind | "auto";
  hardMode?: boolean;
  language?: Lang;
}
