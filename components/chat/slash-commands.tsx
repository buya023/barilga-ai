"use client";

import {
  BombIcon,
  PaletteIcon,
  PenLineIcon,
  PenSquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type SlashCommand = {
  name: string;
  description: string;
  icon: ReactNode;
  action: string;
  shortcut?: string;
};

export const slashCommands: SlashCommand[] = [
  {
    name: "new",
    description: "Шинэ чат эхлэх",
    icon: <PenSquareIcon className="size-3.5" />,
    action: "new",
  },
  {
    name: "clear",
    description: "Одоогийн чатыг цэвэрлэх",
    icon: <Trash2Icon className="size-3.5" />,
    action: "clear",
  },
  {
    name: "rename",
    description: "Чатын нэрийг өөрчлөх",
    icon: <PenLineIcon className="size-3.5" />,
    action: "rename",
  },
  {
    name: "theme",
    description: "Харанхуй/гэрэлтэй горим солих",
    icon: <PaletteIcon className="size-3.5" />,
    action: "theme",
  },
  {
    name: "delete",
    description: "Чат устгах",
    icon: <XIcon className="size-3.5" />,
    action: "delete",
  },
  {
    name: "purge",
    description: "Бүх чатыг устгах",
    icon: <BombIcon className="size-3.5" />,
    action: "purge",
  },
];

type SlashCommandMenuProps = {
  query: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  selectedIndex: number;
};

export function SlashCommandMenu({
  query,
  onSelect,
  onClose: _onClose,
  selectedIndex,
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = slashCommands.filter((cmd) =>
    cmd.name.startsWith(query.toLowerCase())
  );

  useEffect(() => {
    const selected = menuRef.current?.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, []);

  if (filtered.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-border/50 bg-card/95 shadow-[var(--shadow-float)] backdrop-blur-xl"
      ref={menuRef}
    >
      <div className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
        Командууд
      </div>
      <div className="max-h-64 overflow-y-auto pb-1 no-scrollbar">
        {filtered.map((cmd, index) => (
          <button
            className={cn(
              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
              index === selectedIndex ? "bg-muted/70" : "hover:bg-muted/40"
            )}
            data-selected={index === selectedIndex}
            key={cmd.name}
            onClick={() => onSelect(cmd)}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            <div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground/60">
              {cmd.icon}
            </div>
            <span className="font-mono text-[13px] text-foreground">
              /{cmd.name}
            </span>
            <span className="text-[12px] text-muted-foreground/50">
              {cmd.description}
            </span>
            {cmd.shortcut && (
              <span className="ml-auto text-[11px] text-muted-foreground/30">
                {cmd.shortcut}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
