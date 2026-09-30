/**
 * Stand-in for the cookie store of `next/headers`. Tests set cookies here to
 * simulate a browser, and read back what the code under test set.
 */
export const jar = new Map<string, string>();

export function resetCookies() {
  jar.clear();
}

export const cookieStore = {
  get(name: string) {
    const value = jar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set(name: string, value: string) {
    jar.set(name, value);
  },
  delete(name: string) {
    jar.delete(name);
  },
};
