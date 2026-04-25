"use client";

import { HardHatIcon, PanelLeftIcon } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { state, toggleSidebar, isMobile } = useSidebar();

  if (state === "collapsed" && !isMobile) {
    return null;
  }

  return (
    <header className="sticky top-0 flex h-14 items-center gap-2 bg-sidebar px-3">
      <Button
        className="md:hidden"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <Link
        className="flex items-center gap-2 md:hidden"
        href="/"
      >
        <HardHatIcon className="size-4 text-primary" />
        <span className="text-sm font-semibold">MBI</span>
      </Link>

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <div className="hidden items-center gap-3 md:ml-auto md:flex">
        <a
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          href="mailto:mbi.feedback@gmail.com?subject=MBI%20санал%20хүсэлт"
          rel="noopener noreferrer"
          target="_blank"
        >
          Санал хүсэлт
        </a>
        <span className="text-xs text-muted-foreground">
          Барилгын норм, стандартын AI
        </span>
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
