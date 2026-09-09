"use client";

import { useEffect, useRef } from "react";

/**
 * Renders iyzico's embeddable checkout blob.
 *
 * React will not execute <script> tags inserted via dangerouslySetInnerHTML,
 * so each one is recreated through document.createElement and swapped in.
 *
 * Only reached when the provider returns form HTML instead of a hosted URL.
 * The ordinary checkout form returns a paymentPageUrl (despite
 * @types/iyzipay omitting the field), and this could not be verified for the
 * subscription form because that endpoint is not provisioned on the account.
 */
export function IyzicoCheckoutForm({ content }: { content: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = content;

    for (const stale of Array.from(host.querySelectorAll("script"))) {
      const script = document.createElement("script");
      for (const attr of Array.from(stale.attributes)) {
        script.setAttribute(attr.name, attr.value);
      }
      script.text = stale.textContent ?? "";
      stale.replaceWith(script);
    }

    return () => {
      host.innerHTML = "";
    };
  }, [content]);

  return <div ref={hostRef} />;
}
