import React from 'react';

// @mention helpers shared by the three sides of a project's client chat —
// the Client Portal tab, the Seller/PM page and the Admin page. All three
// speak the same wire format (see App\Services\ProjectClientChatService):
// the message text carries "@Name" and a separate `mentions` array carries
// the ids, with 0 meaning Company Admin (which is not a `users` row).

export interface Mentionable {
  user_id: number;
  name: string | null;
  role_type: string | null;
}

// The trailing "@partial" the caret is sitting on, or null when the user
// isn't typing a mention. Requires the @ to start a word so an email address
// never opens the picker.
export function mentionQueryOf(text: string): string | null {
  const at = text.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(text[at - 1])) return null;
  const rest = text.slice(at + 1);
  // A mention name can contain spaces ("Company Admin"), so allow a couple
  // of words before giving up on the match.
  return /\n/.test(rest) || rest.split(' ').length > 3 ? null : rest;
}

export function matchMentionables(people: Mentionable[], query: string): Mentionable[] {
  const q = query.toLowerCase();
  return people.filter(p => (p.name ?? '').toLowerCase().includes(q));
}

// Replaces the "@partial" being typed with the picked name. Returns the new
// text; the caller adds the id to its own mentions array.
export function applyMention(text: string, name: string): string {
  const at = text.lastIndexOf('@');
  if (at === -1) return text;
  return `${text.slice(0, at)}@${name} `;
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Renders message text with its own tagged names highlighted. Only names the
// message actually mentions are matched, so an "@" typed casually in prose
// stays plain text.
export function renderWithMentions(
  content: string | null,
  mentionIds: number[] | null | undefined,
  nameById: Record<number, string>,
  highlight: React.CSSProperties,
): React.ReactNode {
  if (!content) return content;

  const names = (mentionIds ?? [])
    .map(id => nameById[id])
    .filter((n): n is string => !!n)
    // Longest first so "@Ali Raza" wins over a shorter "@Ali".
    .sort((a, b) => b.length - a.length);

  if (!names.length) return content;

  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = content.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));

  return parts.map((part, i) =>
    part.startsWith('@') && names.includes(part.slice(1))
      ? <span key={i} style={highlight}>{part}</span>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}
