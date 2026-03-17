import { config } from "../../package.json";

export function initLocale() {
  const l10n = new (
    typeof Localization === "undefined"
      ? ztoolkit.getGlobal("Localization")
      : Localization
  )([`${config.addonRef}-addon.ftl`], true);
  addon.data.locale = { current: l10n };
}

export function getString(
  localeString: string,
  options?: { branch?: string; args?: Record<string, unknown> },
): string {
  const l10n = addon.data.locale?.current;
  if (!l10n) return localeString;

  const pattern = l10n.formatMessagesSync([
    { id: localeString, args: options?.args },
  ])?.[0];
  if (!pattern) return localeString;

  if (options?.branch) {
    return (
      pattern.attributes?.find(
        (a: { name: string }) => a.name === options.branch,
      )?.value ?? localeString
    );
  }
  return pattern.value ?? localeString;
}
