"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import {
  ConversationSidebar,
  type Conversation,
} from "./_components/conversation-sidebar";
import {
  ChatMessage,
  type ChatMessageData,
  type Artifact,
} from "./_components/chat-message";
import { CmdChatInput } from "./_components/chat-input";
import { ArtifactPanel } from "./_components/artifact-panel";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Terminal,
} from "lucide-react";
import { StyledIcon } from "@/components/styled-icon";
import { DashBadge } from "@/components/decorations/dot-badge";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    title: "DocuFlow enterprise GTM strategy",
    preview: "Let's analyze the enterprise document processing market...",
    updatedAt: "2m ago",
    model: "Claude Opus",
    workstream: "DocuFlow",
    pinned: true,
    messageCount: 24,
  },
  {
    id: "c2",
    title: "Arcwise execution engine design",
    preview: "Should trigger metadata be top-level or nested...",
    updatedAt: "4h ago",
    model: "Claude Sonnet",
    workstream: "Arcwise",
    pinned: true,
    messageCount: 18,
  },
  {
    id: "c3",
    title: "Lattice pricing model analysis",
    preview: "Per-seat vs usage-based for mid-market teams...",
    updatedAt: "6h ago",
    model: "Claude Opus",
    workstream: "Lattice",
    messageCount: 12,
  },
  {
    id: "c4",
    title: "DocuFlow extraction model deployment",
    preview: "Optimizing cold start times and batch processing...",
    updatedAt: "Yesterday",
    model: "Claude Sonnet",
    workstream: "DocuFlow",
    messageCount: 31,
  },
  {
    id: "c5",
    title: "HealthKit data model spec",
    preview: "Wearable data mapping for metrics ingestion...",
    updatedAt: "Yesterday",
    model: "Claude Sonnet",
    workstream: "HealthKit",
    messageCount: 8,
  },
  {
    id: "c6",
    title: "TutorBase usage analytics review",
    preview: "Lincoln USD shows 2.3x normal usage pattern...",
    updatedAt: "Mar 25",
    workstream: "TutorBase",
    messageCount: 6,
  },
];

const SAMPLE_MESSAGES: ChatMessageData[] = [
  {
    id: "m1",
    role: "user",
    content:
      "Analyze the enterprise document processing market for DocuFlow. I want to understand the total addressable market, key drivers, and how we should position our product.",
    timestamp: "14:32",
  },
  {
    id: "m2",
    role: "assistant",
    content: `## Enterprise Document Processing Market Analysis

### Market Size & Opportunity

The enterprise document processing market is substantial and growing:

- **Total Addressable Market (TAM):** ~$3.1B annually across financial services, healthcare, legal, and insurance
- **Regulatory compliance** drives mandatory adoption across all verticals
- **AI-powered extraction** is replacing manual data entry at accelerating pace
- **Growth rate:** 18-22% CAGR driven by digital transformation and cost pressure

### Key Market Drivers

| Driver | Impact | Trend |
|---|---|---|
| Regulatory compliance | High — SOX, HIPAA, KYC | Increasing enforcement |
| Labor cost reduction | High — 60-80% savings | Accelerating adoption |
| AI/ML accuracy gains | Medium — enables new use cases | Improving quarterly |
| Cloud migration | Medium — enables SaaS delivery | Near-universal |

### Strategic Positioning

DocuFlow should position as the **intelligent extraction layer** rather than a generic IDP tool:

1. **Custom model training** — your domain-specific models are a key differentiator
2. **Real-time processing** — not batch-only like legacy tools
3. **Multi-format coverage** — PDFs, invoices, contracts, forms in one pipeline

### Competitive Landscape

The main competitors fall into three categories:

\`\`\`
Tier 1 (Enterprise): Kofax, ABBYY, OpenText
Tier 2 (AI-native): Hyperscience, Rossum, Instabase
Tier 3 (Point tools): Textract, Document AI, Form Recognizer
\`\`\`

DocuFlow sits between Tier 1 and Tier 2 — you have the **ML depth** of AI-native tools with the **reliability** of enterprise solutions.

### Recommended Next Steps

- Convert **2 of 3 pilot accounts** currently in staging
- Build case study with a **mid-market insurance firm** (fastest sales cycle)
- Pursue **SOC 2 Type II** certification for enterprise credibility`,
    timestamp: "14:33",
    model: "Claude Opus",
    thinking:
      "The user wants a comprehensive market analysis. I should cover TAM, key drivers, competitive landscape, and strategic positioning. Let me structure this to be actionable rather than just informational.",
    artifacts: [
      {
        id: "art1",
        type: "document",
        title: "Enterprise Document Processing Market Analysis",
        content: `# Enterprise Document Processing Market Analysis

## Executive Summary

The enterprise document processing market represents a $3.1B annual opportunity with 18-22% growth, driven by regulatory compliance and AI-enabled automation gains.

## Market Segmentation

### Primary Segments
- **Financial Services (30%)**: KYC, loan origination, claims processing
- **Healthcare (25%)**: Medical records, insurance claims, lab reports
- **Legal (20%)**: Contract analysis, discovery, compliance filings
- **Insurance (15%)**: Policy underwriting, claims intake, adjustor reports
- **Government (10%)**: Forms processing, benefits administration

## DocuFlow Positioning Matrix

| Capability | DocuFlow | Kofax | ABBYY | Hyperscience |
|---|---|---|---|---|
| Custom Models | ★★★ | ★ | ★★ | ★★ |
| Real-time Processing | ★★★ | ★ | ★ | ★★ |
| API-first | ★★★ | ★ | ★★ | ★★★ |
| Multi-format | ★★★ | ★★★ | ★★★ | ★★ |
| Pricing | Mid | High | High | Mid |

## Go-to-Market Strategy

### Phase 1: Insurance Vertical (Q2 2026)
- Convert 3 pilot accounts to paid contracts
- Offer pilot program: free 30-day processing assessment
- Build 2 case studies with measurable ROI

### Phase 2: Financial Services (Q3 2026)
- Complete SOC 2 Type II certification
- Target firms with active digital transformation initiatives
- Partner with existing fintech integration platforms

### Phase 3: Healthcare & Legal (Q4 2026)
- HIPAA compliance certification
- Legal discovery partnership with e-discovery platforms`,
      },
    ],
  },
  {
    id: "m3",
    role: "user",
    content:
      "This is great. Can you write me a cold outreach email template for VP of Operations at insurance companies?",
    timestamp: "14:35",
  },
  {
    id: "m4",
    role: "assistant",
    content: `Here's a cold outreach template that positions DocuFlow as a solution to their biggest pain point — the volume of documents that need manual processing:

\`\`\`
Subject: Cutting claims processing time by 70% at [Company]

Hi [Name],

I noticed [Company] recently [expanded your claims team / posted operations roles / mentioned processing backlogs in your earnings call]. That tells me document throughput is top of mind for your operations team.

Most VP Ops I talk to are buried in manual data entry — claims forms, policy documents, adjustor reports — all needing human review with limited staff.

We built DocuFlow specifically for this problem. Our platform:

• Extracts structured data from any document format (94% accuracy on first pass)
• Generates audit-ready processing reports
• Integrates with your existing claims management system via API

We're onboarding 5 insurance companies for a free 30-day pilot this quarter. Would it be worth a 15-minute call to see if [Company] is a fit?

Best,
[Your name]
\`\`\`

A few notes on why this works:

- **Opens with a trigger event** — shows you did research
- **Names the specific pain point** — document throughput, not "automation" in general
- **Quantifies the capability** — 94% accuracy is concrete
- **Low-commitment CTA** — 15 minutes, not a demo

Want me to also draft a follow-up sequence?`,
    timestamp: "14:36",
    model: "Claude Opus",
    artifacts: [
      {
        id: "art2",
        type: "code",
        title: "Cold Outreach Email Template",
        language: "markdown",
        content: `Subject: Cutting claims processing time by 70% at [Company]

Hi [Name],

I noticed [Company] recently [expanded your claims team / posted operations roles / mentioned processing backlogs in your earnings call]. That tells me document throughput is top of mind for your operations team.

Most VP Ops I talk to are buried in manual data entry — claims forms, policy documents, adjustor reports — all needing human review with limited staff.

We built DocuFlow specifically for this problem. Our platform:

• Extracts structured data from any document format (94% accuracy on first pass)
• Generates audit-ready processing reports
• Integrates with your existing claims management system via API

We're onboarding 5 insurance companies for a free 30-day pilot this quarter. Would it be worth a 15-minute call to see if [Company] is a fit?

Best,
[Your name]`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [activeConversationId, setActiveConversationId] = useState("c1");
  const [messages, setMessages] = useState<ChatMessageData[]>(SAMPLE_MESSAGES);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [model, setModel] = useState("Claude Opus");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Collect all artifacts from messages
  const allArtifacts = messages.flatMap((m) => m.artifacts || []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessageData = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    // Simulate streaming response
    const streamingMessage: ChatMessageData = {
      id: `msg-${Date.now() + 1}`,
      role: "assistant",
      content: "",
      model,
      isStreaming: true,
      thinking: "Processing request...",
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    };

    setMessages((prev) => [...prev, streamingMessage]);

    // Simulate response completion
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingMessage.id
            ? {
                ...m,
                content:
                  "I'll work on that. This is a simulated response — connect a real API endpoint to enable full conversations with your agents.",
                isStreaming: false,
                thinking:
                  "The user wants to continue the conversation. I should provide a helpful response.",
              }
            : m,
        ),
      );
      setIsStreaming(false);
    }, 1500);
  }, [input, isStreaming, model]);

  const handleStop = useCallback(() => {
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? { ...m, isStreaming: false, content: m.content || "[Stopped]" }
          : m,
      ),
    );
  }, []);

  const handleArtifactClick = useCallback((artifact: Artifact) => {
    setActiveArtifact(artifact);
    setArtifactPanelOpen(true);
  }, []);

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setActiveConversationId("");
    setArtifactPanelOpen(false);
    setActiveArtifact(null);
  }, []);

  const handleRetry = useCallback((id: string) => {
    // Remove the message and re-send the previous user message
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx > 0) {
        return prev.slice(0, idx);
      }
      return prev;
    });
  }, []);

  // Initial empty state
  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex">
      {/* Sidebar — fixed width, outside resizable group */}
      {sidebarOpen && (
        <div className="w-[280px] shrink-0 h-full">
          <ConversationSidebar
            conversations={CONVERSATIONS}
            activeId={activeConversationId}
            onSelect={(id) => {
              setActiveConversationId(id);
              if (id === "c1") {
                setMessages(SAMPLE_MESSAGES);
              } else {
                setMessages([]);
              }
            }}
            onNew={handleNewConversation}
          />
        </div>
      )}

      {/* Main area — resizable between chat and artifact panel */}
      <div className="flex-1 min-w-0 h-full">
        <ResizablePanelGroup orientation="horizontal">
          {/* Chat area */}
          <ResizablePanel
            defaultSize={artifactPanelOpen ? 60 : 100}
            minSize={40}
          >
            <div className="flex h-full flex-col bg-neutral-50">
              {/* Chat header */}
              <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 h-[45px]">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setSidebarOpen((s) => !s)}
                    className="flex size-7 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
                    title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                  >
                    {sidebarOpen ? (
                      <PanelLeftClose className="size-4" />
                    ) : (
                      <PanelLeftOpen className="size-4" />
                    )}
                  </button>
                  <div className="h-4 w-px bg-neutral-200 shrink-0" />
                  {activeConversationId ? (
                    <span className="font-mono text-[13px] font-medium text-neutral-900 truncate">
                      {CONVERSATIONS.find((c) => c.id === activeConversationId)
                        ?.title || "New conversation"}
                    </span>
                  ) : (
                    <span className="font-mono text-[13px] text-neutral-400">
                      New conversation
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setArtifactPanelOpen((s) => !s);
                    }}
                    className={cn(
                      "flex size-7 items-center justify-center transition-colors",
                      artifactPanelOpen
                        ? "text-accent-500 bg-accent-50"
                        : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100",
                    )}
                    title={
                      artifactPanelOpen ? "Hide artifacts" : "Show artifacts"
                    }
                  >
                    {artifactPanelOpen ? (
                      <PanelRightClose className="size-4" />
                    ) : (
                      <PanelRightOpen className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Messages area */}
              {isEmpty ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="text-center max-w-md">
                    <StyledIcon
                      icon={Terminal}
                      className="mx-auto mb-4 bg-accent-50 size-12"
                      iconClassName="size-6"
                    />
                    <h2 className="font-display text-[22px] font-medium text-neutral-900 tracking-tight">
                      New conversation
                    </h2>
                    <p className="mt-2 text-[14px] text-neutral-500">
                      Chat with your AI agents. They have context on your
                      workstreams and can execute tasks, write code, research
                      topics, and more.
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      {[
                        "Research competitors for DocuFlow",
                        "Draft a follow-up email",
                        "Review the Arcwise architecture",
                        "Analyze TutorBase usage trends",
                      ].map((s) => (
                        <button
                          key={s}
                          onClick={() => setInput(s)}
                          className="border border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-600 transition-all hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 active:scale-[0.98] font-body"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      onArtifactClick={handleArtifactClick}
                      onRetry={handleRetry}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Input */}
              <CmdChatInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                onStop={handleStop}
                isStreaming={isStreaming}
                model={model}
                onModelChange={setModel}
              />
            </div>
          </ResizablePanel>

          {/* Artifact panel */}
          {artifactPanelOpen && (
            <>
              <ResizableHandle className="w-px bg-neutral-200 hover:bg-accent-300 transition-colors" />
              <ResizablePanel defaultSize={40} minSize={25} collapsible>
                <ArtifactPanel
                  artifact={activeArtifact}
                  artifacts={allArtifacts}
                  onClose={() => {
                    setArtifactPanelOpen(false);
                    setActiveArtifact(null);
                  }}
                  onNavigate={setActiveArtifact}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
