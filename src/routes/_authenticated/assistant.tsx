import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Bot, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { chatAssistant } from "@/lib/openai.functions";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string };

function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Ciao! Sono il tuo assistente per la spesa. Chiedimi quanto hai speso, dove conviene comprare un prodotto, o un consiglio per risparmiare.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chat = useServerFn(chatAssistant);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await chat({
        data: { messages: next.filter((m) => m.role !== "assistant" || messages.indexOf(m) > 0) },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply || "..." }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
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
                m.role === "user" ? "bg-primary text-primary-foreground border-primary" : ""
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
            <Card className="p-3 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Sto pensando...
            </Card>
          </div>
        )}
        <div ref={endRef} />
      </div>

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