/** Reading the fields of a form a Server Action receives. */

/** A text field, or null if it's missing (or a file). */
export function formText(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

/** A text field, empty if it's missing. */
export function formString(formData: FormData, name: string): string {
  return formText(formData, name) ?? "";
}

/** A numeric ID, or null if the field holds anything else. */
export function formId(formData: FormData, name: string): number | null {
  const id = Number(formData.get(name));
  return Number.isInteger(id) ? id : null;
}

/** A checkbox: sent as "on" when ticked, not at all otherwise. */
export function formChecked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

/** The fields of `AccountFields` – initial setup and adding an account. */
export function accountFields(formData: FormData) {
  return {
    email: formString(formData, "email"),
    name: formString(formData, "name"),
    password: formString(formData, "password"),
  };
}
