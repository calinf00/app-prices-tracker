import { createFileRoute } from "@tanstack/react-router";
import { toUserMessage } from "@/lib/user-errors";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Bot, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { chatAssistant } from "@/lib/openai.functions";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "assistant-chat-v1";
const WELCOME: Msg = {
  role: "assistant",
  content:
    "Ciao! Sono il tuo assistente per la spesa. Chiedimi quanto hai speso, dove conviene comprare un prodotto, o un consiglio per risparmiare.",
};
const SUGGESTIONS = [
  "Ultimo prezzo del latte?",
  "Negozio più economico?",
  "Spesa di questo mese?",
  "Prezzi aumentati?",
];

function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [WELCOME];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return [WELCOME];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chat = useServerFn(chatAssistant);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const convo = next.filter((m, i) => !(i === 0 && m.role === "assistant" && m.content === WELCOME.content));
      const res = await chat({
        data: { messages: convo.length ? convo : next },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply || "..." }]);
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore"));
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    setInput("");
    void sendMessage(text);
  };

  const resetChat = () => {
    setMessages([WELCOME]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const showSuggestions = messages.length <= 1 && !loading;

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <div className="flex items-center justify-between pb-2">
        <h1 className="text-lg font-semibold">Assistente</h1>
        <Button variant="outline" size="sm" onClick={resetChat} disabled={loading}>
          <Plus className="h-4 w-4 mr-1" /> Nuova conversazione
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pb-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="h-7 w-7 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <Card
              className={`p-3 max-w-[80%] text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-foreground border-border"
              }`}
            >
              {m.content}
            </Card>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Bot className="h-4 w-4" />
            </div>
            <Card className="p-3 bg-muted border-border inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-2 w-2 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-2 w-2 rounded-full bg-muted-foreground/70 animate-bounce" />
            </Card>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {showSuggestions && (
        <div className="flex flex-wrap gap-2 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void sendMessage(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted hover:bg-muted/70 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 pt-2 border-t border-border">
        <Input
          placeholder="Scrivi un messaggio..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || loading}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}