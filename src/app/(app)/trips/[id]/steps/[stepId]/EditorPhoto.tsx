"use client";

import { PlayIcon } from "@/components/icons";
import PhotoImg from "@/components/PhotoImg";
import { useI18n } from "@/lib/i18n/client";
import { CAPTION_MAX_LENGTH } from "@/lib/limits";
import type { ViewPhoto } from "@/lib/view-types";
import { deletePhotoAction, setCoverPhotoAction } from "@/app/(app)/actions";

/**
 * One photo in the editor: preview, caption (saved with the step's form) and
 * the actions that take effect right away.
 */
export default function EditorPhoto({
  photo,
  tripId,
  isCover,
  onCoverSet,
  onRemoved,
}: {
  photo: ViewPhoto;
  tripId: number;
  /** Made the cover in this editor session – confirmed with a check mark. */
  isCover: boolean;
  onCoverSet: () => void;
  onRemoved: () => void;
}) {
  const { t } = useI18n();

  async function makeCover() {
    const body = new FormData();
    body.append("tripId", String(tripId));
    body.append("photoId", String(photo.id));
    await setCoverPhotoAction(body);
    onCoverSet();
  }

  async function remove() {
    onRemoved();
    const body = new FormData();
    body.append("photoId", String(photo.id));
    await deletePhotoAction(body);
  }

  return (
    <li className="flex gap-3 rounded-2xl border border-line p-2">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
        <PhotoImg photo={photo} variant="thumb" className="h-full w-full object-cover" sizes="80px" />
        {photo.mediaType === "video" && (
          <span className="absolute inset-0 grid place-items-center bg-black/25">
            <PlayIcon className="h-6 w-6 fill-white drop-shadow" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <input
          name={`caption_${photo.id}`}
          defaultValue={photo.caption ?? ""}
          maxLength={CAPTION_MAX_LENGTH}
          className="field py-1.5 text-[15px]"
          placeholder={t.stepEditor.captionPlaceholder}
          aria-label={t.stepEditor.captionLabel}
        />
        <div className="flex gap-4 px-1 text-[13px] font-medium">
          <button type="button" onClick={makeCover} className="text-ink-soft transition hover:text-accent">
            {isCover ? t.stepEditor.coverSet : t.stepEditor.cover}
          </button>
          <button type="button" onClick={remove} className="text-ink-faint transition hover:text-accent">
            {t.common.remove}
          </button>
        </div>
      </div>
    </li>
  );
}
