'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ClaWatchLogo, ClaWatchIcon } from '@/components/clawatch-logo';

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`text-gray-400 hover:text-white transition-colors ${className}`}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#10b981">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
        </svg>
      )}
    </button>
  );
}

function TerminalBlock({ children, copyText }: { children: React.ReactNode; copyText?: string }) {
  return (
    <div className="relative bg-[#0d1117] rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        {copyText && <CopyButton text={copyText} />}
      </div>
      <div className="p-4 font-mono text-sm leading-relaxed overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

const features = [
  {
    title: 'Cost Monitoring & Thresholds',
    description: 'Track spend per agent in real-time. Set daily or monthly limits with automatic alerts when thresholds are approached or exceeded.',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    title: 'Smart Alerts to Your Phone',
    description: 'Get instant notifications for stuck agents, errors, cost spikes, and anomalies. Telegram, Slack, or webhook — your choice.',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
  },
  {
    title: 'Control Agents from Anywhere',
    description: 'Pause, resume, or stop agents directly from the dashboard or your phone. One click, instant effect.',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
    ),
  },
  {
    title: 'Unified Session View',
    description: 'Group sessions into projects for a bird\'s-eye view. See cost, timeline, and agent breakdown across related work.',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    title: 'Humanized Error Troubleshooting',
    description: 'No more digging through scattered logs. ClaWatch surfaces errors in plain language with context and suggested fixes.',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    title: 'Multi-Profile Support',
    description: 'Monitor multiple OpenClaw installations from one dashboard. Switch profiles instantly — dev, staging, production.',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
];

const providers = [
  { name: 'OpenClaw', icon: '🦞', status: 'supported' as const },
  { name: 'NanoClaw', icon: '🔬', status: 'supported' as const },
  { name: 'LangChain', icon: '🔗', status: 'coming' as const },
  { name: 'AutoGPT', icon: '🤖', status: 'coming' as const },
  { name: 'CrewAI', icon: '👥', status: 'coming' as const },
  { name: 'Custom Agents', icon: '⚡', status: 'coming' as const },
];

const cliCommands = [
  { cmd: 'clawatch start', desc: 'Auto-detect agents, start monitoring, and open the dashboard' },
  { cmd: 'clawatch stop', desc: 'Stop the monitoring daemon gracefully' },
  { cmd: 'clawatch status', desc: 'Show active agents, sessions, and daemon health' },
  { cmd: 'clawatch logs', desc: 'Stream real-time logs from the monitoring daemon' },
];

const platforms = ['macOS', 'Linux (Ubuntu/Debian)', 'Windows WSL', 'Raspberry Pi', 'AWS', 'GCP', 'Digital Ocean', 'Hetzner'];

const channels = [
  { name: 'Telegram', available: true },
  { name: 'Slack', available: false },
  { name: 'Discord', available: false },
  { name: 'Email', available: false },
  { name: 'PagerDuty', available: false },
];

const faqs = [
  { q: 'What is ClaWatch?', a: 'ClaWatch is an open source observability platform for AI agents. It monitors your OpenClaw agents in real-time, tracking heartbeats, token usage, costs, and errors.' },
  { q: 'Is it free?', a: 'Yes. ClaWatch is MIT licensed and free forever. You can self-host it or use our managed service.' },
  { q: 'How do I install?', a: 'Run npm install -g clawatch in your terminal. Then run clawatch start — it auto-detects your OpenClaw agents and opens the dashboard.' },
  { q: 'What data does it collect?', a: 'Agent heartbeats, token usage, costs, and errors from OpenClaw session files. Everything stays local on your machine by default.' },
  { q: 'Does it work with other agent frameworks?', a: 'Currently ClaWatch supports OpenClaw. Support for additional agent frameworks is coming soon.' },
  { q: 'Where is my data stored?', a: 'Locally on your machine. Nothing leaves your network unless you explicitly opt-in to managed hosting.' },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="font-medium text-white">{q}</span>
        <svg
          className={`size-5 text-gray-400 transition-transform shrink-0 ml-4 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-4 text-gray-400 leading-relaxed text-sm">
          {a}
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* 1. STICKY NAV */}
      <nav className="border-b border-white/[0.06] backdrop-blur-md sticky top-0 z-50 bg-[#0a0a0f]/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <ClaWatchIcon />
              <ClaWatchLogo size="md" />
            </div>
            <div className="hidden sm:flex items-center gap-5 text-sm text-gray-400">
              <a href="#quickstart" className="hover:text-white transition-colors">Quick Start</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/clawatch"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm" className="gap-2 border-white/[0.1] bg-transparent hover:bg-white/[0.05] text-gray-300 hover:text-white">
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Star
              </Button>
            </a>
            <Link href="/dashboard">
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* 2. HERO */}
      <section className="pt-28 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm mb-8">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Open Source &middot; Free Forever
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Know what your agents
            <br />
            are doing.{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
              Right now.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Your OpenClaw agents spawn sub-agents, burn tokens, call tools.
            ClaWatch shows you everything, in real-time. Open source. Free forever.
          </p>
          <div className="flex items-center justify-center gap-4 mb-16">
            <Link href="/dashboard">
              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-8 text-base font-medium">
                Get Started
              </Button>
            </Link>
            <a href="https://github.com/clawatch" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg" className="h-12 px-8 text-base gap-2 border-white/[0.1] bg-transparent hover:bg-white/[0.05] text-gray-300 hover:text-white font-medium">
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Star on GitHub
              </Button>
            </a>
          </div>
          <div className="max-w-2xl mx-auto">
            <TerminalBlock copyText="npm install -g clawatch && clawatch start">
              <div><span className="text-emerald-400">$</span> <span className="text-gray-300">npm install -g clawatch</span></div>
              <div className="mt-1"><span className="text-emerald-400">$</span> <span className="text-gray-300">clawatch start</span></div>
              <div className="text-emerald-400 mt-0.5">&#10003; Found 12 agents, 130 sessions</div>
              <div className="text-emerald-400 mt-0.5">&#10003; Monitoring started. Dashboard → http://localhost:3001</div>
            </TerminalBlock>
          </div>
        </div>
      </section>

      {/* 3. QUICK START */}
      <section id="quickstart" className="py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            <span className="text-emerald-400">&#10095;</span> Quick Start
          </h2>
          <p className="text-gray-400 mb-12 text-lg">Up and running in under 60 seconds.</p>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Step 1 */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="text-emerald-400 text-sm font-mono mb-3">Step 1</div>
              <h3 className="text-lg font-semibold mb-2">Install</h3>
              <p className="text-gray-400 text-sm mb-4">Install the CLI globally via npm.</p>
              <TerminalBlock copyText="npm install -g clawatch">
                <div><span className="text-emerald-400">$</span> <span className="text-gray-300">npm install -g clawatch</span></div>
                <div className="text-gray-500 mt-1">added 1 package in 3s</div>
              </TerminalBlock>
            </div>
            {/* Step 2 */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="text-emerald-400 text-sm font-mono mb-3">Step 2</div>
              <h3 className="text-lg font-semibold mb-2">Start</h3>
              <p className="text-gray-400 text-sm mb-4">Auto-detects agents, starts monitoring, opens dashboard.</p>
              <TerminalBlock copyText="clawatch start">
                <div><span className="text-emerald-400">$</span> <span className="text-gray-300">clawatch start</span></div>
                <div className="text-gray-500 mt-1">Scanning ~/.openclaw...</div>
                <div className="text-emerald-400 mt-0.5">&#10003; Found 12 agents, 130 sessions</div>
                <div className="text-emerald-400 mt-0.5">&#10003; Dashboard → localhost:3001</div>
              </TerminalBlock>
            </div>
          </div>
        </div>
      </section>

      {/* 4. WHAT YOU GET */}
      <section id="features" className="py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">What You Get</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Everything you need to keep AI agents in check. Lightweight, fast, and open source.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 hover:border-emerald-500/30 transition-colors"
              >
                <div className="size-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKS WITH YOUR STACK */}
      <section className="py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Works with Your Stack</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              ClaWatch auto-detects your agent framework. Full support today, more coming soon.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {providers.map((p) => (
              <div key={p.name} className="group relative bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 text-center hover:border-emerald-500/30 hover:scale-[1.02] transition-all duration-200">
                <div className="size-12 mx-auto mb-3 rounded-lg bg-white/[0.05] flex items-center justify-center text-2xl">
                  {p.icon}
                </div>
                <div className="font-semibold mb-2">{p.name}</div>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  p.status === 'supported'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {p.status === 'supported' ? 'Fully supported' : 'Coming soon'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            Want support for your framework?{' '}
            <a href="https://github.com/GENWAY-AI/clawatch/issues" className="text-emerald-400 hover:text-emerald-300 transition-colors">
              Request it →
            </a>
          </p>
        </div>
      </section>

      {/* 5. CLI COMMANDS */}
      <section className="py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-center">CLI Commands</h2>
          <p className="text-gray-400 text-lg text-center mb-12">
            Simple, powerful commands. No config files needed.
          </p>
          <TerminalBlock>
            {cliCommands.map((c, i) => (
              <div key={c.cmd} className={i > 0 ? 'mt-3' : ''}>
                <div>
                  <span className="text-emerald-400">$</span>{' '}
                  <span className="text-white">{c.cmd}</span>
                </div>
                <div className="text-gray-500 text-xs mt-0.5 ml-4">{c.desc}</div>
              </div>
            ))}
          </TerminalBlock>
        </div>
      </section>

      {/* 6. RUNS WHERE YOU RUN */}
      <section className="py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Runs Where You Run</h2>
          <p className="text-gray-400 text-lg mb-12">
            If OpenClaw runs there, ClaWatch runs there.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {platforms.map((p) => (
              <div
                key={p}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] py-4 px-3 text-sm font-medium text-gray-300 hover:border-emerald-500/30 hover:text-white transition-colors"
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. ALERT CHANNELS */}
      <section className="py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Alert Channels</h2>
          <p className="text-gray-400 text-lg mb-12">
            Get notified where your team already works.
          </p>
          <div className="flex items-center justify-center gap-6 sm:gap-10 flex-wrap">
            {channels.map((ch) => (
              <div key={ch.name} className="flex flex-col items-center gap-2 relative">
                <div className={`size-14 rounded-xl flex items-center justify-center text-2xl font-bold ${ch.available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.03] text-gray-500 border border-white/[0.06]'}`}>
                  {ch.name === 'Telegram' && <TelegramIcon className="size-7" />}
                  {ch.name === 'Slack' && <SlackIcon className="size-7" />}
                  {ch.name === 'Discord' && <DiscordIcon className="size-7" />}
                  {ch.name === 'Email' && <EmailIcon className="size-7" />}
                  {ch.name === 'PagerDuty' && <PagerDutyIcon className="size-7" />}
                </div>
                <span className={`text-xs ${ch.available ? 'text-white' : 'text-gray-500'}`}>{ch.name}</span>
                {!ch.available && (
                  <span className="text-[10px] text-gray-500 bg-white/[0.05] px-1.5 py-0.5 rounded-full">coming soon</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. FAQ */}
      <section id="faq" className="py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center">FAQ</h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <FAQItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* 9. CTA */}
      <section className="py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to see what your agents are doing?
          </h2>
          <div className="max-w-md mx-auto mb-8">
            <TerminalBlock copyText="npm install -g clawatch">
              <div><span className="text-emerald-400">$</span> <span className="text-gray-300">npm install -g clawatch</span></div>
            </TerminalBlock>
          </div>
          <Link href="/dashboard">
            <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-10 text-base font-medium">
              Get Started
            </Button>
          </Link>
        </div>
      </section>

      {/* 10. FOOTER */}
      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <ClaWatchLogo size="sm" />
            <span className="text-gray-500">&mdash; Open Source AI Agent Observability</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/clawatch" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              GitHub
            </a>
            <Link href="/dashboard" className="hover:text-white transition-colors">
              Dashboard
            </Link>
            <a href="https://github.com/clawatch" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
    </svg>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function PagerDutyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.965 1.18C15.085.164 13.769 0 10.683 0H3.73v14.55h6.926c2.743 0 4.8-.164 6.61-1.37 1.975-1.303 3.004-3.47 3.004-6.074 0-2.879-1.216-4.895-3.305-5.926zM10.39 10.34H8.275V4.09h2.255c3.025 0 4.636.85 4.636 3.04 0 2.352-1.71 3.21-4.776 3.21zM3.73 18.316h4.546V24H3.73z" />
    </svg>
  );
}
