"use client";

import { useState } from "react";
import { FiMessageCircle, FiUsers, FiLink, FiClock, FiPlus, FiSend } from "react-icons/fi";
import { FaWhatsapp, FaTelegram, FaTwitter, FaInstagram } from "react-icons/fa";
import { SiMessenger } from "react-icons/si";
import Loading from "@/app/components/loading/Loading";

const stats = [
  { label: "Total Conversations", value: 128, icon: FiMessageCircle, color: "bg-primary/10 text-primary" },
  { label: "Unread Messages", value: 24, icon: FiClock, color: "bg-accent/10 text-accent" },
  { label: "Connected Accounts", value: 4, icon: FiLink, color: "bg-secondary/20 text-secondary" },
  { label: "Pending Replies", value: 7, icon: FiSend, color: "bg-blue-500/10 text-blue-500" },
];

const recentConversations = [
  { id: 1, name: "Ahmed Hossain", platform: "whatsapp", message: "Can you send the invoice?", time: "10:30 AM", unread: true },
  { id: 2, name: "Sara Khan", platform: "telegram", message: "Meeting at 3 PM?", time: "9:15 AM", unread: false },
  { id: 3, name: "Rafiq Traders", platform: "messenger", message: "Price list updated", time: "Yesterday", unread: true },
  { id: 4, name: "Nadia Rahman", platform: "instagram", message: "Thanks for your support!", time: "Yesterday", unread: false },
  { id: 5, name: "Mr. Kamal", platform: "twitter", message: "DM about partnership", time: "2 days ago", unread: false },
];

const platformIcon = {
  whatsapp: <FaWhatsapp className="text-green-500" />,
  telegram: <FaTelegram className="text-blue-400" />,
  messenger: <SiMessenger className="text-blue-600" />,
  instagram: <FaInstagram className="text-pink-500" />,
  twitter: <FaTwitter className="text-sky-400" />,
};

export default function HomePage() {
  const [loading, setLoading] = useState(false);

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <Loading size="lg" text="Loading Dashboard Data..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:shadow-md"
          >
            <div className={`rounded-full p-3 ${stat.color}`}>
              <stat.icon size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-text">{stat.value}</p>
              <p className="text-sm text-text/60">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="w-full rounded-2xl border border-border bg-surface p-4 shadow-sm lg:w-2/3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Recent Conversations</h2>
            <button className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20">
              View All
            </button>
          </div>
          <div className="space-y-1">
            {recentConversations.map((conv) => (
              <div
                key={conv.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl p-3 transition hover:bg-primary/5"
              >
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary/20 text-xl">
                    {platformIcon[conv.platform as keyof typeof platformIcon] || "💬"}
                  </div>
                  {conv.unread && (
                    <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent ring-2 ring-surface" />
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-text">{conv.name}</p>
                    <span className="text-xs text-text/40">{conv.time}</span>
                  </div>
                  <p className="truncate text-sm text-text/60">{conv.message}</p>
                </div>
                {conv.unread && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                    1
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-1/3">
        
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-text">Message Trend (Last 7 days)</h3>
            <div className="flex h-24 items-end justify-between gap-1">
              {[30, 45, 28, 60, 75, 55, 40].map((height, i) => (
                <div
                  key={i}
                  className="w-full rounded-md bg-primary/30 transition-all hover:bg-primary"
                  style={{ height: `${(height / 80) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-text/40">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-text">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <button className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
                <FiPlus size={16} /> New Message
              </button>
              <button className="flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10">
                <FiLink size={16} /> Connect Account
              </button>
              <button className="flex items-center gap-2 rounded-full bg-secondary/30 px-4 py-2 text-sm font-medium text-text/70 hover:bg-secondary/50">
                <FiClock size={16} /> View All
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-text">Platform Status</h3>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <FaWhatsapp className="text-green-500" /> WhatsApp
                </span>
                <span className="text-xs text-green-500">● Connected</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <FaTelegram className="text-blue-400" /> Telegram
                </span>
                <span className="text-xs text-green-500">● Connected</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <SiMessenger className="text-blue-600" /> Messenger
                </span>
                <span className="text-xs text-yellow-500">● Pending</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}