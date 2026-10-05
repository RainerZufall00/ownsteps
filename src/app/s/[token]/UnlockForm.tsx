"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import FormFeedback from "@/components/FormFeedback";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import { unlockAction, type UnlockState } from "./actions";

const initial: UnlockState = {};

export default function UnlockForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unlockAction, initial);
  const router = useRouter();
  const { t } = useI18n();

  // After a successful entry the cookie is set – reload the page.
  useEffect(() => {
    if (!pending && state.ok) router.refresh();
  }, [state, pending, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label className="label" htmlFor="password">
          {t.common.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="field"
          placeholder="••••••"
        />
      </div>

      <FormFeedback error={state.error} />

      <SubmitButton pendingLabel={t.share.unlocking}>{t.share.unlock}</SubmitButton>
    </form>
  );
}
