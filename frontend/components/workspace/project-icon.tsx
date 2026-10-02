import { Folder } from "lucide-react";
import { IconTile } from "@/components/icon-tile";

// The backend's default icon; treated as "none chosen" so it gets the themed Lucide folder.
const DEFAULT_ICON = "\u{1F4C1}";

/**
 * An Application File's icon in the shared header tile. The stored icon (user/system
 * data) is never changed: a custom one renders inside the tile, and the default or an
 * empty value falls back to the Lucide folder.
 */
export function ProjectIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const custom = icon && icon.trim() && icon !== DEFAULT_ICON ? icon : null;
  return custom ? (
    <IconTile className={className}>
      <span className="text-lg leading-none">{custom}</span>
    </IconTile>
  ) : (
    <IconTile icon={Folder} className={className} />
  );
}
