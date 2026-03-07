"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Clock,
  ListTodo,
  MessageCircle,
  Mic,
  Paperclip,
  Pin,
  Plus,
  Send,
  StopCircle,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { getSupabase } from "@/lib/supabase";
import { getClientWorkspaceId } from "@/lib/client-settings";

type Viewer = {
  id: string;
  email: string | null;
  name: string;
  role: string;
  isSuperAdmin: boolean;
};

type InternalChatParticipant = {
  user_id: string;
  email?: string | null;
  display_name: string;
  role: string;
};

type InternalChatAttachment = {
  id: number;
  thread_id: number;
  file_name: string;
  mime_type?: string | null;
  size_bytes: number;
  created_at: string;
  download_url: string;
};

type InternalChatThread = {
  id: number;
  workspace_id: string;
  scope: string;
  title: string;
  participants: InternalChatParticipant[];
  last_message_preview?: string | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
};

type InternalChatMessage = {
  id: number;
  thread_id: number;
  sender_user_id: string;
  sender_name: string;
  sender_email?: string | null;
  sender_role: string;
  body: string;
  attachments: InternalChatAttachment[];
  created_at: string;
};

type InternalChatContact = {
  user_id: string;
  email?: string | null;
  display_name: string;
  role: string;
};

type InternalChatTask = {
  id: number;
  thread_id: number;
  workspace_id: string;
  title: string;
  notes?: string | null;
  due_at?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type InternalChatTelegramLink = {
  id: number;
  workspace_id: string;
  thread_id: number;
  user_id: string;
  user_role: string;
  telegram_chat_id: string;
  telegram_username?: string | null;
  telegram_first_name?: string | null;
  is_active: boolean;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const JUDITH_ASSISTANT_USER_ID = "judith-ai";
const TELEGRAM_BOT_USERNAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "judith_aibot").replace("@", "");
const REFRESH_INTERVAL_MS = 30000;
const THREAD_REFRESH_INTERVAL_MS = 90000;
const REMINDER_REFRESH_MS = 120000;
const NOTICE_AUTO_HIDE_MS = 5000;
const UZ_TZ = "Asia/Tashkent";
const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

const shouldShowOnPath = (pathname: string) => {
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/settings")) return true;
  if (pathname.startsWith("/notifications")) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
};

const normalizeRole = (role: string | null | undefined, fallback: string): string => {
  const next = (role || "").trim().toLowerCase();
  return next || fallback;
};

const parseApiDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const isoBase = raw.includes(" ") ? raw.replace(" ", "T") : raw;
  const hasTimezone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(isoBase);
  const normalized = hasTimezone ? isoBase : `${isoBase}Z`;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const formatTimeUZ = (value?: string | null) => {
  const d = parseApiDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UZ_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const formatDateTimeUZ = (value?: string | null) => {
  const d = parseApiDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UZ_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const sortThreads = (threads: InternalChatThread[]) => {
  const priority = (scope: string) => {
    if (scope === "judith_assistant") return 0;
    if (scope === "owner_direct") return 1;
    return 2;
  };
  return [...threads].sort((a, b) => {
    const p = priority(a.scope) - priority(b.scope);
    if (p !== 0) return p;
    const aTime = a.last_message_at || a.updated_at;
    const bTime = b.last_message_at || b.updated_at;
    if (aTime === bTime) return b.id - a.id;
    return aTime < bTime ? 1 : -1;
  });
};

const toUzIsoFromDatetimeLocal = (raw: string): string => {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return new Date(raw).toISOString();
  }
  const [, y, m, d, hh, mm] = match;
  const utcMillis = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) - 5, Number(mm));
  return new Date(utcMillis).toISOString();
};

const isAudioMime = (mime?: string | null) => (mime || "").toLowerCase().startsWith("audio/");

const buildMessageSnapshot = (items: InternalChatMessage[]) => {
  if (!items.length) return "0";
  const last = items[items.length - 1];
  return `${items.length}:${last.id}:${last.created_at}`;
};

const isNearBottom = (node: HTMLDivElement | null) => {
  if (!node) return true;
  const threshold = 120;
  const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
  return remaining <= threshold;
};

export default function InternalChatLauncher() {
  const pathname = usePathname();
  const visible = useMemo(() => shouldShowOnPath(pathname || ""), [pathname]);

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [threads, setThreads] = useState<InternalChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<InternalChatMessage[]>([]);
  const [contacts, setContacts] = useState<InternalChatContact[]>([]);
  const [judithTasks, setJudithTasks] = useState<InternalChatTask[]>([]);
  const [reminders, setReminders] = useState<InternalChatTask[]>([]);

  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [pending, setPending] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [manualUserId, setManualUserId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualRole, setManualRole] = useState("team_member");
  const [showDirectChatForm, setShowDirectChatForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskDueLocal, setTaskDueLocal] = useState("");
  const [showJudithDesk, setShowJudithDesk] = useState(false);
  const [showTaskComposer, setShowTaskComposer] = useState(false);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [telegramLinkSaving, setTelegramLinkSaving] = useState(false);
  const [telegramLink, setTelegramLink] = useState<InternalChatTelegramLink | null>(null);
  const [notice, setNotice] = useState("");
  const [taskLoading, setTaskLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [clearingMessages, setClearingMessages] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesPaneRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef(false);
  const remindersPollingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastMessageSnapshotRef = useRef("0");

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [activeThreadId, threads],
  );

  const isJudithThread = activeThread?.scope === "judith_assistant";

  const effectiveWorkspace = useMemo(() => {
    if (viewer?.isSuperAdmin) {
      return workspaceFilter.trim();
    }
    return getClientWorkspaceId();
  }, [viewer?.isSuperAdmin, workspaceFilter]);

  const ensureSpecialThreads = useCallback(
    async (sourceThreads: InternalChatThread[]) => {
      if (!viewer || !effectiveWorkspace) return sourceThreads;

      const next = [...sourceThreads];
      const payload = {
        workspace_id: effectiveWorkspace,
        requester_user_id: viewer.id,
        requester_email: viewer.email,
        requester_name: viewer.name,
        requester_role: viewer.role,
      };

      if (!next.some((thread) => thread.scope === "judith_assistant")) {
        const res = await fetch(`${API}/internal-chat/threads/judith`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const thread = (await res.json()) as InternalChatThread;
          next.unshift(thread);
        }
      }

      if (!viewer.isSuperAdmin && !next.some((thread) => thread.scope === "owner_direct")) {
        const res = await fetch(`${API}/internal-chat/threads/owner-direct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const thread = (await res.json()) as InternalChatThread;
          next.unshift(thread);
        }
      }

      return sortThreads(next);
    },
    [effectiveWorkspace, viewer],
  );

  const loadThreads = useCallback(async (options?: { background?: boolean }) => {
    if (!viewer) return;
    const background = options?.background ?? false;
    if (!background) setLoadingThreads(true);
    try {
      const query = new URLSearchParams({
        user_id: viewer.id,
        user_role: viewer.role,
        limit: "100",
      });
      if (effectiveWorkspace) {
        query.set("workspace_id", effectiveWorkspace);
      }

      const res = await fetch(`${API}/internal-chat/threads?${query.toString()}`);
      if (!res.ok) {
        throw new Error("Could not load internal chat threads.");
      }

      let payload = (await res.json()) as InternalChatThread[];
      payload = await ensureSpecialThreads(payload);
      payload = sortThreads(payload);
      setThreads(payload);

      if (!activeThreadId && payload.length) {
        setActiveThreadId(payload[0].id);
      }
      if (activeThreadId && !payload.some((thread) => thread.id === activeThreadId)) {
        setActiveThreadId(payload[0]?.id ?? null);
      }
      if (!background) setNotice("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load internal chat threads.";
      setNotice(message);
    } finally {
      if (!background) setLoadingThreads(false);
    }
  }, [activeThreadId, effectiveWorkspace, ensureSpecialThreads, viewer]);

  const loadMessages = useCallback(async (options?: { background?: boolean }) => {
    if (!viewer || !activeThreadId) {
      setMessages([]);
      lastMessageSnapshotRef.current = "0";
      return;
    }
    const background = options?.background ?? false;
    const wasNearBottom = isNearBottom(messagesPaneRef.current);
    if (!background) setLoadingMessages(true);
    try {
      const query = new URLSearchParams({
        user_id: viewer.id,
        user_role: viewer.role,
        limit: "300",
      });
      const res = await fetch(`${API}/internal-chat/threads/${activeThreadId}/messages?${query.toString()}`);
      if (!res.ok) {
        throw new Error("Could not load conversation messages.");
      }
      const payload = (await res.json()) as InternalChatMessage[];
      const nextSnapshot = buildMessageSnapshot(payload);
      if (nextSnapshot !== lastMessageSnapshotRef.current) {
        setMessages(payload);
        lastMessageSnapshotRef.current = nextSnapshot;
        if (wasNearBottom) {
          requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({ behavior: background ? "auto" : "smooth" });
          });
        }
      }
      if (!background) setNotice("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load conversation messages.";
      setNotice(message);
    } finally {
      if (!background) setLoadingMessages(false);
    }
  }, [activeThreadId, viewer]);

  const loadContacts = useCallback(async () => {
    if (!viewer) return;
    try {
      const query = new URLSearchParams({
        user_id: viewer.id,
        user_role: viewer.role,
      });
      if (effectiveWorkspace) {
        query.set("workspace_id", effectiveWorkspace);
      }
      const res = await fetch(`${API}/internal-chat/contacts?${query.toString()}`);
      if (!res.ok) return;
      const payload = (await res.json()) as InternalChatContact[];
      setContacts(payload);
    } catch {
      // silent
    }
  }, [effectiveWorkspace, viewer]);

  const loadJudithTasks = useCallback(async () => {
    if (!viewer || !activeThreadId || !isJudithThread) {
      setJudithTasks([]);
      return;
    }
    setTaskLoading(true);
    try {
      const query = new URLSearchParams({ user_id: viewer.id, user_role: viewer.role, limit: "200" });
      const res = await fetch(`${API}/internal-chat/threads/${activeThreadId}/judith/tasks?${query.toString()}`);
      if (!res.ok) return;
      const payload = (await res.json()) as InternalChatTask[];
      setJudithTasks(payload);
    } finally {
      setTaskLoading(false);
    }
  }, [activeThreadId, isJudithThread, viewer]);

  const loadJudithTelegramLink = useCallback(async () => {
    if (!viewer || !activeThreadId || !isJudithThread) {
      setTelegramLink(null);
      setTelegramChatId("");
      return;
    }

    setTelegramLinkLoading(true);
    try {
      const query = new URLSearchParams({ user_id: viewer.id, user_role: viewer.role });
      const res = await fetch(`${API}/internal-chat/threads/${activeThreadId}/judith/telegram-link?${query.toString()}`);
      if (!res.ok) {
        return;
      }
      const payload = (await res.json()) as InternalChatTelegramLink | null;
      setTelegramLink(payload);
      setTelegramChatId(payload?.telegram_chat_id || "");
    } finally {
      setTelegramLinkLoading(false);
    }
  }, [activeThreadId, isJudithThread, viewer]);

  const loadReminders = useCallback(async () => {
    if (!viewer) return;
    const workspace = effectiveWorkspace;
    if (!workspace && !viewer.isSuperAdmin) return;
    try {
      const query = new URLSearchParams({ user_id: viewer.id, user_role: viewer.role, limit: "20" });
      if (workspace) query.set("workspace_id", workspace);
      const res = await fetch(`${API}/internal-chat/judith/reminders?${query.toString()}`);
      if (!res.ok) return;
      const payload = (await res.json()) as InternalChatTask[];
      setReminders(payload);
    } catch {
      // silent
    }
  }, [effectiveWorkspace, viewer]);

  useEffect(() => {
    if (!visible) {
      setOpen(false);
      return;
    }

    let mounted = true;
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        const user = data.user;
        if (!mounted || !user) {
          setViewer(null);
          return;
        }
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const role = normalizeRole(typeof metadata.role === "string" ? metadata.role : null, "client");
        const displayName =
          typeof metadata.full_name === "string" && metadata.full_name.trim()
            ? metadata.full_name.trim()
            : (user.email || "user").split("@")[0];

        setViewer({
          id: user.id,
          email: user.email ?? null,
          name: displayName,
          role,
          isSuperAdmin: role === "admin" || role === "owner" || role === "super_admin",
        });
      })
      .catch(() => setViewer(null));

    return () => {
      mounted = false;
    };
  }, [visible]);

  useEffect(() => {
    if (!open || !viewer) return;
    void loadThreads();
    void loadContacts();
    void loadReminders();
  }, [loadContacts, loadReminders, loadThreads, open, viewer]);

  useEffect(() => {
    if (!open || !viewer || !activeThreadId) return;
    const runPoll = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        await loadMessages({ background: true });
        if (isJudithThread) {
          await loadJudithTasks();
        }
      } finally {
        pollingRef.current = false;
      }
    };

    void runPoll();
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void runPoll();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeThreadId, isJudithThread, loadJudithTasks, loadMessages, open, viewer]);

  useEffect(() => {
    if (!open || !viewer) return;
    if (!isJudithThread || !activeThreadId) {
      setTelegramLink(null);
      setTelegramChatId("");
      return;
    }
    void loadJudithTelegramLink();
  }, [activeThreadId, isJudithThread, loadJudithTelegramLink, open, viewer]);

  useEffect(() => {
    if (!open || !viewer) return;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadThreads({ background: true });
      void loadReminders();
    }, THREAD_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadReminders, loadThreads, open, viewer]);

  useEffect(() => {
    if (!open || !viewer) return;
    const runReminderPoll = async () => {
      if (remindersPollingRef.current) return;
      remindersPollingRef.current = true;
      try {
        await loadReminders();
      } finally {
        remindersPollingRef.current = false;
      }
    };
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void runReminderPoll();
    }, REMINDER_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadReminders, open, viewer]);

  useEffect(() => {
    if (!open || !activeThreadId) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    });
  }, [activeThreadId, open]);

  const buildAttachmentUrl = (attachment: InternalChatAttachment) => {
    if (!viewer) return "#";
    const query = new URLSearchParams({ user_id: viewer.id, user_role: viewer.role });
    return `${API}${attachment.download_url}?${query.toString()}`;
  };

  const createDirectThread = async () => {
    if (!viewer) return;

    const selected = contacts.find((item) => item.user_id === selectedContactId);
    const targetUserId = (selected?.user_id || manualUserId).trim();
    if (!targetUserId) {
      setNotice("Select a contact or provide user ID for a direct conversation.");
      return;
    }

    try {
      const res = await fetch(`${API}/internal-chat/threads/direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: effectiveWorkspace || "global-admin",
          requester_user_id: viewer.id,
          requester_email: viewer.email,
          requester_name: viewer.name,
          requester_role: viewer.role,
          target_user_id: targetUserId,
          target_email: selected?.email || manualEmail || null,
          target_name: selected?.display_name || manualName || null,
          target_role: selected?.role || manualRole,
          title: selected?.display_name ? `Direct • ${selected.display_name}` : undefined,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not create direct conversation.");
      }
      const thread = (await res.json()) as InternalChatThread;
      setThreads((prev) => sortThreads([thread, ...prev.filter((item) => item.id !== thread.id)]));
      setActiveThreadId(thread.id);
      setSelectedContactId("");
      setManualUserId("");
      setManualName("");
      setManualEmail("");
      setNotice("");
      void loadContacts();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create direct conversation.");
    }
  };

  const send = async () => {
    if (!viewer || !activeThread || !pending.trim()) return;

    const body = pending.trim();
    setPending("");

    try {
      const res = await fetch(`${API}/internal-chat/threads/${activeThread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_user_id: viewer.id,
          sender_email: viewer.email,
          sender_name: viewer.name,
          sender_role: viewer.role,
          body,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not send message.");
      }

      const msg = (await res.json()) as InternalChatMessage;
      setMessages((prev) => {
        const next = [...prev, msg];
        lastMessageSnapshotRef.current = buildMessageSnapshot(next);
        return next;
      });
      setThreads((prev) =>
        sortThreads(
          prev.map((thread) =>
            thread.id === activeThread.id
              ? {
                  ...thread,
                  last_message_preview: msg.body.length > 120 ? `${msg.body.slice(0, 117)}...` : msg.body,
                  last_message_at: msg.created_at,
                  updated_at: msg.created_at,
                }
              : thread,
          ),
        ),
      );
      setNotice("");
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });

      if (activeThread.scope === "judith_assistant") {
        await loadMessages({ background: true });
        await loadJudithTasks();
        await loadReminders();
      }
    } catch (error) {
      setPending(body);
      setNotice(error instanceof Error ? error.message : "Could not send message.");
    }
  };

  const sendAttachment = async (file: File, caption?: string) => {
    if (!viewer || !activeThread) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("sender_user_id", viewer.id);
      formData.append("sender_role", viewer.role);
      formData.append("sender_name", viewer.name);
      if (viewer.email) formData.append("sender_email", viewer.email);
      if (caption) formData.append("caption", caption);
      formData.append("file", file);

      const res = await fetch(`${API}/internal-chat/threads/${activeThread.id}/attachments`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not upload attachment.");
      }

      const msg = (await res.json()) as InternalChatMessage;
      setMessages((prev) => {
        const next = [...prev, msg];
        lastMessageSnapshotRef.current = buildMessageSnapshot(next);
        return next;
      });
      setThreads((prev) =>
        sortThreads(
          prev.map((thread) =>
            thread.id === activeThread.id
              ? {
                  ...thread,
                  last_message_preview: msg.body.length > 120 ? `${msg.body.slice(0, 117)}...` : msg.body,
                  last_message_at: msg.created_at,
                  updated_at: msg.created_at,
                }
              : thread,
          ),
        ),
      );
      setNotice("");
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });

      if (activeThread.scope === "judith_assistant") {
        await loadMessages({ background: true });
        await loadJudithTasks();
        await loadReminders();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Attachment upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const transcribeAudioBlob = async (blob: Blob) => {
    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
      type: blob.type || "audio/webm",
    });
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API}/agents/transcribe`, {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => ({}))) as { text?: string; detail?: string };
    if (!response.ok) {
      throw new Error(payload.detail || "Audio transcription failed.");
    }
    const transcript = (payload.text || "").trim();
    if (!transcript) {
      throw new Error("No speech detected.");
    }
    return transcript;
  };

  const stopMediaStream = () => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const startRecordingAudio = async () => {
    if (uploading || isRecordingAudio || !activeThread) return;
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      setNotice("Audio recording is not available in this environment.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = AUDIO_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        stopMediaStream();
        setIsRecordingAudio(false);

        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!audioBlob.size) {
          setNotice("Recording was empty.");
          return;
        }

        void (async () => {
          const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
          const file = new File([audioBlob], `voice-${Date.now()}.${extension}`, {
            type: audioBlob.type || "audio/webm",
          });
          let caption = "Voice message";
          try {
            const transcript = await transcribeAudioBlob(audioBlob);
            caption = `Voice message\nTranscript: ${transcript}`;
          } catch {
            // Keep voice upload usable even without transcription.
          }
          await sendAttachment(file, caption);
        })();
      };

      recorder.onerror = () => {
        setIsRecordingAudio(false);
        stopMediaStream();
        setNotice("Audio recording failed.");
      };

      recorder.start();
      setIsRecordingAudio(true);
      setNotice("Recording... click stop to send.");
    } catch {
      setNotice("Microphone permission denied or unavailable.");
      setIsRecordingAudio(false);
      stopMediaStream();
    }
  };

  const stopRecordingAudio = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.stop();
    }
  };

  const onAttachFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.currentTarget.value = "";
    if (!files.length || !activeThread) return;
    for (const file of files) {
      await sendAttachment(file);
    }
  };

  const createJudithTask = async () => {
    if (!viewer || !activeThread || activeThread.scope !== "judith_assistant") return;
    const title = taskTitle.trim();
    if (!title) {
      setNotice("Task title is required.");
      return;
    }

    setTaskLoading(true);
    try {
      const res = await fetch(`${API}/internal-chat/threads/${activeThread.id}/judith/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          notes: taskNotes.trim() || null,
          due_at: taskDueLocal ? toUzIsoFromDatetimeLocal(taskDueLocal) : null,
          creator_user_id: viewer.id,
          creator_name: viewer.name,
          creator_email: viewer.email,
          creator_role: viewer.role,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not create Judith task.");
      }
      setTaskTitle("");
      setTaskNotes("");
      setTaskDueLocal("");
      await loadJudithTasks();
      await loadMessages({ background: true });
      await loadThreads({ background: true });
      await loadReminders();
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create Judith task.");
    } finally {
      setTaskLoading(false);
    }
  };

  const toggleJudithTask = async (task: InternalChatTask) => {
    if (!viewer) return;
    try {
      const res = await fetch(`${API}/internal-chat/judith/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_completed: !task.is_completed,
          user_id: viewer.id,
          user_role: viewer.role,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not update task.");
      }
      await loadJudithTasks();
      await loadMessages({ background: true });
      await loadThreads({ background: true });
      await loadReminders();
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update task.");
    }
  };

  const removeCompletedJudithTask = async (task: InternalChatTask) => {
    if (!viewer || !task.is_completed) return;
    try {
      const query = new URLSearchParams({
        user_id: viewer.id,
        user_role: viewer.role,
      });
      const res = await fetch(`${API}/internal-chat/judith/tasks/${task.id}?${query.toString()}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not remove completed task.");
      }
      await loadJudithTasks();
      await loadMessages({ background: true });
      await loadThreads({ background: true });
      await loadReminders();
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove completed task.");
    }
  };

  const removeJudithMessage = async (message: InternalChatMessage) => {
    if (!viewer || !isJudithThread) return;
    const ok = typeof window === "undefined" ? true : window.confirm("Remove this message?");
    if (!ok) return;

    setDeletingMessageId(message.id);
    try {
      const query = new URLSearchParams({
        user_id: viewer.id,
        user_role: viewer.role,
      });
      const res = await fetch(`${API}/internal-chat/messages/${message.id}?${query.toString()}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not remove message.");
      }
      await loadMessages({ background: true });
      await loadThreads({ background: true });
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove message.");
    } finally {
      setDeletingMessageId(null);
    }
  };

  const clearJudithMessages = async () => {
    if (!viewer || !activeThread || !isJudithThread) return;
    const ok = typeof window === "undefined" ? true : window.confirm("Clean all messages in this Judith chat?");
    if (!ok) return;

    setClearingMessages(true);
    try {
      const query = new URLSearchParams({
        user_id: viewer.id,
        user_role: viewer.role,
      });
      const res = await fetch(`${API}/internal-chat/threads/${activeThread.id}/messages?${query.toString()}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not clean Judith messages.");
      }
      setMessages([]);
      lastMessageSnapshotRef.current = "0";
      await loadThreads({ background: true });
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not clean Judith messages.");
    } finally {
      setClearingMessages(false);
    }
  };

  const saveJudithTelegramLink = async () => {
    if (!viewer || !activeThread || !isJudithThread) return;
    const chatId = telegramChatId.trim();
    if (!chatId) {
      setNotice("Telegram chat ID is required.");
      return;
    }

    setTelegramLinkSaving(true);
    try {
      const res = await fetch(`${API}/internal-chat/threads/${activeThread.id}/judith/telegram-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: viewer.id,
          user_role: viewer.role,
          telegram_chat_id: chatId,
        }),
      });
      const payload = (await res.json().catch(() => null)) as InternalChatTelegramLink | { detail?: string } | null;
      if (!res.ok) {
        const detail = payload && typeof payload === "object" && "detail" in payload ? payload.detail : null;
        throw new Error(detail || "Could not link Telegram chat.");
      }
      const row = payload as InternalChatTelegramLink;
      setTelegramLink(row);
      setTelegramChatId(row.telegram_chat_id);
      setNotice(`Telegram linked. Send /start to @${TELEGRAM_BOT_USERNAME} if this is your first time.`);
      await loadMessages({ background: true });
      await loadThreads({ background: true });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not link Telegram chat.");
    } finally {
      setTelegramLinkSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      stopMediaStream();
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isJudithThread) {
      setShowJudithDesk(false);
      setShowTaskComposer(false);
      setShowTelegramSetup(false);
    }
  }, [isJudithThread]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice("");
    }, NOTICE_AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!visible || !viewer) return null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={onAttachFiles}
        style={{ display: "none" }}
      />

      {open ? (
        <div
          style={{
            position: "fixed",
            right: "14px",
            top: "74px",
            bottom: "132px",
            width: "min(980px, calc(100vw - 28px))",
            borderRadius: "18px",
            border: "1px solid var(--border-default)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 95%, var(--accent) 5%) 0%, var(--bg-surface) 100%)",
            boxShadow:
              "0 22px 56px rgba(0,0,0,0.28), 0 4px 18px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.04)",
            backdropFilter: "blur(14px)",
            overflow: "hidden",
            zIndex: 210,
            display: "flex",
          }}
        >
          <aside
            style={{
              width: "320px",
              borderRight: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--bg-panel) 92%, var(--accent) 8%) 0%, var(--bg-panel) 64%)",
            }}
          >
            <div style={{ padding: "14px", borderBottom: "1px solid var(--border-default)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <div>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Internal Chat</p>
                  <p style={{ fontSize: "12px", marginTop: "2px", color: "var(--text-subtle)" }}>
                    Team, owner and Judith assistant.
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  style={iconBtnStyle}
                  aria-label="Close internal chat"
                >
                  <X size={14} />
                </button>
              </div>

              <p style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-subtle)" }}>Timezone: UZT (Asia/Tashkent)</p>

              {viewer.isSuperAdmin ? (
                <input
                  value={workspaceFilter}
                  onChange={(event) => setWorkspaceFilter(event.target.value)}
                  placeholder="Filter workspace (optional)"
                  style={{ ...fieldStyle, marginTop: "10px" }}
                />
              ) : (
                <p style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-subtle)" }}>
                  Workspace: {effectiveWorkspace}
                </p>
              )}

              <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                <button
                  onClick={() => setShowDirectChatForm((value) => !value)}
                  style={{
                    ...secondaryBtnStyle,
                    width: "100%",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <Plus size={14} />
                    Start Direct Chat
                  </span>
                  {showDirectChatForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showDirectChatForm ? (
                  <div
                    style={{
                      border: "1px solid var(--border-default)",
                      borderRadius: "12px",
                      background: "color-mix(in srgb, var(--bg-elevated) 88%, var(--accent) 12%)",
                      padding: "8px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px" }}>
                      <select
                        value={selectedContactId}
                        onChange={(event) => setSelectedContactId(event.target.value)}
                        style={fieldStyle}
                      >
                        <option value="">Choose contact</option>
                        {contacts.map((contact) => (
                          <option key={contact.user_id} value={contact.user_id}>
                            {contact.display_name} ({contact.role})
                          </option>
                        ))}
                      </select>
                      <button onClick={createDirectThread} style={secondaryBtnStyle}>
                        <Plus size={14} />
                      </button>
                    </div>

                    <input
                      value={manualUserId}
                      onChange={(event) => setManualUserId(event.target.value)}
                      placeholder="Manual user ID"
                      style={fieldStyle}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      <input
                        value={manualName}
                        onChange={(event) => setManualName(event.target.value)}
                        placeholder="Display name"
                        style={fieldStyle}
                      />
                      <input
                        value={manualRole}
                        onChange={(event) => setManualRole(event.target.value)}
                        placeholder="Role"
                        style={fieldStyle}
                      />
                    </div>
                    <input
                      value={manualEmail}
                      onChange={(event) => setManualEmail(event.target.value)}
                      placeholder="Email (optional)"
                      style={fieldStyle}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {loadingThreads ? (
                <p style={subtleLineStyle}>Loading chats...</p>
              ) : threads.length ? (
                threads.map((thread) => {
                  const active = thread.id === activeThreadId;
                  const pinned = thread.scope === "judith_assistant";
                  return (
                    <button
                      key={thread.id}
                      onClick={() => setActiveThreadId(thread.id)}
                      style={{
                        ...threadBtnStyle,
                        borderColor: active ? "var(--accent)" : "var(--border-default)",
                        background: active
                          ? "linear-gradient(140deg, color-mix(in srgb, var(--accent-soft) 88%, var(--bg-elevated) 12%), color-mix(in srgb, var(--accent-soft) 70%, var(--bg-panel) 30%))"
                          : "color-mix(in srgb, var(--bg-elevated) 92%, var(--bg-panel) 8%)",
                        boxShadow: active ? "0 10px 22px rgba(0,0,0,0.18)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          {pinned ? <Pin size={12} color="var(--accent)" /> : null}
                          {thread.title}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--text-quiet)" }}>
                          {formatTimeUZ(thread.last_message_at || thread.updated_at)}
                        </span>
                      </div>
                      <p style={{ marginTop: "3px", fontSize: "11px", color: "var(--text-subtle)" }}>
                        {thread.last_message_preview || (pinned ? "Pinned assistant chat" : "No messages yet")}
                      </p>
                    </button>
                  );
                })
              ) : (
                <p style={subtleLineStyle}>No conversations yet.</p>
              )}
            </div>
          </aside>

          <section
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 95%, var(--accent) 5%) 0%, var(--bg-surface) 100%)",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--border-default)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--bg-panel) 90%, var(--accent) 10%) 0%, var(--bg-panel) 100%)",
              }}
            >
              <div>
                <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  {isJudithThread ? <CheckSquare size={14} color="var(--accent)" /> : null}
                  {activeThread?.title || "Conversation"}
                </p>
                <p style={{ marginTop: "5px", fontSize: "12px", color: "var(--text-subtle)" }}>
                  {activeThread?.participants.map((participant) => participant.display_name).join(", ") ||
                    "Select or create a conversation"}
                </p>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                {isJudithThread ? (
                  <button
                    onClick={() => setShowTelegramSetup((value) => !value)}
                    title={showTelegramSetup ? "Hide Telegram setup" : "Set up Telegram bot"}
                    aria-label={showTelegramSetup ? "Hide Telegram setup" : "Set up Telegram bot"}
                    style={{
                      ...secondaryBtnStyle,
                      borderColor: showTelegramSetup ? "var(--accent)" : "var(--border-default)",
                      color: showTelegramSetup ? "var(--accent)" : "var(--text-subtle)",
                      width: "38px",
                      height: "38px",
                      padding: "0",
                    }}
                  >
                    <Bot size={15} />
                  </button>
                ) : null}
                {isJudithThread ? (
                  <button
                    onClick={() => {
                      void clearJudithMessages();
                    }}
                    disabled={clearingMessages}
                    title="Clean Judith messages"
                    aria-label="Clean Judith messages"
                    style={{
                      ...secondaryBtnStyle,
                      color: "var(--danger)",
                      borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border-default) 65%)",
                      background: "color-mix(in srgb, var(--danger) 10%, var(--bg-elevated) 90%)",
                      opacity: clearingMessages ? 0.7 : 1,
                      width: "38px",
                      height: "38px",
                      padding: "0",
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
                {isJudithThread ? (
                  <button
                    onClick={() => setShowJudithDesk((value) => !value)}
                    title={showJudithDesk ? "Hide tasks panel" : "Show tasks panel"}
                    aria-label={showJudithDesk ? "Hide tasks panel" : "Show tasks panel"}
                    style={{
                      ...secondaryBtnStyle,
                      borderColor: showJudithDesk ? "var(--accent)" : "var(--border-default)",
                      color: showJudithDesk ? "var(--accent)" : "var(--text-subtle)",
                      width: "38px",
                      height: "38px",
                      padding: "0",
                    }}
                  >
                    <ListTodo size={15} />
                  </button>
                ) : null}
                <button
                  onClick={() => void loadThreads()}
                  title="Refresh chats"
                  aria-label="Refresh chats"
                  style={{
                    ...secondaryBtnStyle,
                    width: "38px",
                    height: "38px",
                    padding: "0",
                  }}
                >
                  <Users size={14} />
                </button>
              </div>
            </div>

            {reminders.length ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border-default)",
                  background:
                    "linear-gradient(90deg, color-mix(in srgb, var(--warning, #d29f36) 14%, var(--bg-panel) 86%), var(--bg-panel))",
                }}
              >
                <p style={{ fontSize: "12px", color: "var(--text-primary)", display: "inline-flex", alignItems: "center", gap: "8px", fontWeight: 500 }}>
                  <Clock size={12} color="var(--warning, #d29f36)" />
                  {reminders.length} Judith deadline reminder{reminders.length > 1 ? "s" : ""}. Next: {reminders[0]?.title} ({formatDateTimeUZ(reminders[0]?.due_at)})
                </p>
              </div>
            ) : null}

            {isJudithThread && showTelegramSetup ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border-default)",
                  background:
                    "linear-gradient(90deg, color-mix(in srgb, var(--accent-soft) 18%, var(--bg-panel) 82%), color-mix(in srgb, var(--bg-panel) 92%, var(--accent-soft) 8%))",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px" }}>
                  <input
                    value={telegramChatId}
                    onChange={(event) => setTelegramChatId(event.target.value)}
                    placeholder="Enter Telegram chat ID"
                    style={fieldStyle}
                  />
                  <button
                    onClick={() => {
                      void saveJudithTelegramLink();
                    }}
                    disabled={telegramLinkSaving || telegramLinkLoading}
                    style={{ ...primaryBtnStyle, opacity: telegramLinkSaving || telegramLinkLoading ? 0.65 : 1 }}
                  >
                    <Bot size={14} />
                    {telegramLinkSaving ? "Linking..." : "Link"}
                  </button>
                </div>

                <p style={{ fontSize: "11px", color: "var(--text-subtle)", lineHeight: 1.5 }}>
                  Open{" "}
                  <a
                    href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
                  >
                    @{TELEGRAM_BOT_USERNAME}
                  </a>{" "}
                  and send <strong>/start</strong>. Unknown users automatically receive their Telegram chat ID and setup steps.
                </p>

                <p style={{ fontSize: "11px", color: "var(--text-primary)" }}>
                  {telegramLinkLoading
                    ? "Checking existing Telegram link..."
                    : telegramLink
                    ? `Connected chat ID: ${telegramLink.telegram_chat_id}${
                        telegramLink.last_seen_at ? ` • Verified ${formatDateTimeUZ(telegramLink.last_seen_at)}` : ""
                      }`
                    : "No Telegram chat linked yet for this user."}
                </p>
              </div>
            ) : null}

            <div
              ref={messagesPaneRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 16px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                background:
                  "radial-gradient(1200px 540px at 82% -20%, color-mix(in srgb, var(--accent-soft) 22%, transparent), transparent 46%)",
              }}
            >
              {loadingMessages ? (
                <p style={subtleLineStyle}>Loading messages...</p>
              ) : messages.length ? (
                messages.map((msg) => {
                  const mine = msg.sender_user_id === viewer.id;
                  const canDelete = isJudithThread && (mine || msg.sender_user_id === JUDITH_ASSISTANT_USER_ID);
                  return (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: mine ? "flex-end" : "flex-start",
                        maxWidth: "78%",
                        borderRadius: "14px",
                        padding: "11px 12px",
                        border: "1px solid var(--border-default)",
                        background: mine
                          ? "linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 72%, var(--bg-elevated) 28%), color-mix(in srgb, var(--accent) 14%, var(--bg-panel) 86%))"
                          : "linear-gradient(135deg, color-mix(in srgb, var(--bg-elevated) 93%, var(--bg-panel) 7%), var(--bg-panel))",
                        boxShadow: mine
                          ? "0 8px 18px rgba(0,0,0,0.14)"
                          : "0 5px 14px rgba(0,0,0,0.08)",
                        position: "relative",
                      }}
                      title={formatDateTimeUZ(msg.created_at)}
                    >
                      {canDelete ? (
                        <button
                          onClick={() => {
                            void removeJudithMessage(msg);
                          }}
                          disabled={deletingMessageId === msg.id}
                          title="Remove message"
                          aria-label="Remove message"
                          style={{
                            ...iconBtnStyle,
                            width: "24px",
                            height: "24px",
                            borderRadius: "8px",
                            position: "absolute",
                            top: "7px",
                            right: "7px",
                            color: "var(--danger)",
                            borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border-default) 65%)",
                            background: "color-mix(in srgb, var(--danger) 10%, var(--bg-elevated) 90%)",
                            opacity: deletingMessageId === msg.id ? 0.65 : 0.9,
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : null}
                      <div style={{ fontSize: "11px", color: "var(--text-quiet)", marginBottom: "6px", fontWeight: 500 }}>
                        {msg.sender_name} · {formatTimeUZ(msg.created_at)}
                      </div>
                      <p style={{ fontSize: "13px", lineHeight: 1.45, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                        {msg.body}
                      </p>

                      {msg.attachments?.length ? (
                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {msg.attachments.map((attachment) => {
                            const url = buildAttachmentUrl(attachment);
                            const label = `${attachment.file_name} (${Math.max(1, Math.round(attachment.size_bytes / 1024))} KB)`;
                            return (
                              <div key={attachment.id} style={{ fontSize: "12px" }}>
                                {isAudioMime(attachment.mime_type) ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <audio controls src={url} style={{ width: "100%" }} />
                                    <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
                                      {label}
                                    </a>
                                  </div>
                                ) : (
                                  <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
                                    {label}
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p style={subtleLineStyle}>No messages yet. Start the conversation.</p>
              )}
              <div ref={bottomRef} />
            </div>

            {isJudithThread ? (
              <div
                style={{
                  borderTop: "1px solid var(--border-default)",
                  padding: "10px 14px",
                  background:
                    "linear-gradient(180deg, color-mix(in srgb, var(--bg-panel) 90%, var(--accent) 10%) 0%, var(--bg-panel) 100%)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <button
                    onClick={() => setShowJudithDesk((value) => !value)}
                    style={{
                      ...secondaryBtnStyle,
                      borderColor: showJudithDesk ? "var(--accent)" : "var(--border-default)",
                      color: showJudithDesk ? "var(--accent)" : "var(--text-subtle)",
                    }}
                  >
                    <ListTodo size={14} />
                    Judith Tasks ({judithTasks.length})
                    {showJudithDesk ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showJudithDesk ? (
                    <button
                      onClick={() => setShowTaskComposer((value) => !value)}
                      style={{
                        ...primaryBtnStyle,
                        padding: "8px 10px",
                        fontSize: "11px",
                      }}
                    >
                      <Plus size={14} />
                      {showTaskComposer ? "Hide Add" : "New Task"}
                    </button>
                  ) : null}
                </div>

                {showJudithDesk ? (
                  <div
                    style={{
                      marginTop: "10px",
                      border: "1px solid var(--border-default)",
                      borderRadius: "12px",
                      padding: "10px",
                      background: "color-mix(in srgb, var(--bg-panel) 90%, var(--accent-soft) 10%)",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    {showTaskComposer ? (
                      <div style={{ display: "grid", gap: "8px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <input
                            value={taskTitle}
                            onChange={(event) => setTaskTitle(event.target.value)}
                            placeholder="Checklist item title"
                            style={fieldStyle}
                          />
                          <input
                            value={taskDueLocal}
                            onChange={(event) => setTaskDueLocal(event.target.value)}
                            type="datetime-local"
                            style={fieldStyle}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px" }}>
                          <input
                            value={taskNotes}
                            onChange={(event) => setTaskNotes(event.target.value)}
                            placeholder="Task note (optional)"
                            style={fieldStyle}
                          />
                          <button onClick={createJudithTask} style={primaryBtnStyle} disabled={taskLoading}>
                            <CheckSquare size={14} /> Add Task
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "7px" }}>
                      {taskLoading ? (
                        <p style={subtleLineStyle}>Loading checklist...</p>
                      ) : judithTasks.length ? (
                        judithTasks.slice(0, 20).map((task) => (
                          <div
                            key={task.id}
                            style={{
                              ...threadBtnStyle,
                              background: task.is_completed
                                ? "color-mix(in srgb, var(--bg-elevated) 88%, var(--bg-panel) 12%)"
                                : "color-mix(in srgb, var(--bg-panel) 78%, var(--accent-soft) 22%)",
                              opacity: task.is_completed ? 0.75 : 1,
                              padding: "7px 9px",
                              cursor: "default",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                              <label
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  minWidth: 0,
                                  cursor: "pointer",
                                  flex: 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={task.is_completed}
                                  onChange={() => {
                                    void toggleJudithTask(task);
                                  }}
                                  style={{
                                    width: "15px",
                                    height: "15px",
                                    accentColor: "var(--accent)",
                                    cursor: "pointer",
                                  }}
                                  aria-label={`Mark task ${task.title}`}
                                />
                                <span
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--text-primary)",
                                    textDecoration: task.is_completed ? "line-through" : "none",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {task.title}
                                </span>
                              </label>
                              <span style={{ fontSize: "10px", color: "var(--text-quiet)", flexShrink: 0 }}>
                                {task.due_at ? formatDateTimeUZ(task.due_at) : "No deadline"}
                              </span>
                              {task.is_completed ? (
                                <button
                                  onClick={() => {
                                    void removeCompletedJudithTask(task);
                                  }}
                                  title="Remove completed task"
                                  aria-label={`Remove completed task ${task.title}`}
                                  style={{
                                    ...secondaryBtnStyle,
                                    padding: "4px 7px",
                                    fontSize: "10px",
                                    color: "var(--danger)",
                                    borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border-default) 65%)",
                                    background: "color-mix(in srgb, var(--danger) 10%, var(--bg-elevated) 90%)",
                                  }}
                                >
                                  <Trash2 size={12} />
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p style={subtleLineStyle}>No checklist items yet.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {notice ? (
              <div style={{ padding: "0 14px 10px", fontSize: "12px", color: "var(--danger)" }}>{notice}</div>
            ) : null}

            <div
              style={{
                borderTop: "1px solid var(--border-default)",
                padding: "12px 12px 14px",
                display: "flex",
                gap: "8px",
                alignItems: "flex-end",
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 95%, var(--accent-soft) 5%) 0%, var(--bg-surface) 100%)",
              }}
            >
              <textarea
                value={pending}
                onChange={(event) => setPending(event.target.value)}
                placeholder={activeThread ? "Write a message..." : "Select a conversation first"}
                disabled={!activeThread || uploading}
                rows={2}
                style={{
                  flex: 1,
                  resize: "none",
                  borderRadius: "12px",
                  border: "1px solid var(--border-default)",
                  background: "color-mix(in srgb, var(--bg-panel) 95%, var(--bg-elevated) 5%)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  lineHeight: 1.4,
                  padding: "11px",
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!activeThread || uploading}
                  style={{ ...secondaryBtnStyle, opacity: !activeThread || uploading ? 0.6 : 1 }}
                  title="Attach files"
                >
                  <Paperclip size={14} />
                </button>

                <button
                  onClick={isRecordingAudio ? stopRecordingAudio : startRecordingAudio}
                  disabled={!activeThread || uploading}
                  style={{ ...secondaryBtnStyle, opacity: !activeThread || uploading ? 0.6 : 1 }}
                  title={isRecordingAudio ? "Stop recording" : "Record audio"}
                >
                  {isRecordingAudio ? <StopCircle size={14} /> : <Mic size={14} />}
                </button>

                <button
                  onClick={send}
                  disabled={!activeThread || !pending.trim() || uploading}
                  style={{ ...primaryBtnStyle, opacity: !activeThread || !pending.trim() || uploading ? 0.55 : 1 }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((value) => !value)}
        style={{
          position: "fixed",
          right: "16px",
          bottom: "76px",
          width: "52px",
          height: "52px",
          borderRadius: "16px",
          border: "1px solid var(--border-default)",
          background: open
            ? "linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 72%, var(--bg-panel) 28%), color-mix(in srgb, var(--accent) 16%, var(--bg-surface) 84%))"
            : "linear-gradient(180deg, var(--bg-surface), var(--bg-panel))",
          color: "var(--accent)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
          cursor: "pointer",
          zIndex: 209,
        }}
        aria-label="Open internal chat"
        title="Open internal chat"
      >
        <MessageCircle size={18} />
      </button>
    </>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  borderRadius: "10px",
  border: "1px solid var(--border-default)",
  background: "color-mix(in srgb, var(--bg-elevated) 94%, var(--bg-panel) 6%)",
  color: "var(--text-primary)",
  fontSize: "12px",
  padding: "9px 10px",
};

const iconBtnStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "10px",
  border: "1px solid var(--border-default)",
  background: "color-mix(in srgb, var(--bg-elevated) 92%, var(--bg-panel) 8%)",
  color: "var(--text-subtle)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const primaryBtnStyle: CSSProperties = {
  borderRadius: "10px",
  border: "1px solid var(--accent)",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 72%, var(--bg-panel) 28%), color-mix(in srgb, var(--accent) 20%, var(--bg-surface) 80%))",
  color: "var(--accent)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "10px 12px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtnStyle: CSSProperties = {
  borderRadius: "10px",
  border: "1px solid var(--border-default)",
  background: "color-mix(in srgb, var(--bg-elevated) 92%, var(--bg-panel) 8%)",
  color: "var(--text-subtle)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "9px 12px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};

const threadBtnStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  borderRadius: "12px",
  border: "1px solid var(--border-default)",
  background: "color-mix(in srgb, var(--bg-elevated) 92%, var(--bg-panel) 8%)",
  padding: "10px",
  cursor: "pointer",
  transition: "all 160ms ease",
};

const subtleLineStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--text-subtle)",
  padding: "8px 6px",
};
