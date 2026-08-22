/**
 * Shared HubSpot helpers for the BTJ pipeline (portal 7064094).
 * Contacts carry original_source_desc = "BTJ Labs".
 */

const HS_BASE = 'https://api.hubapi.com';

function hsHeaders() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Phone formats HubSpot may hold for the same number. HubSpot search is exact
 * per value, so match against every shape rather than the raw caller ID.
 */
function phoneVariants(raw) {
  const d10 = String(raw || '').replace(/\D/g, '').slice(-10);
  if (d10.length !== 10) return [];
  const a = d10.slice(0, 3), b = d10.slice(3, 6), c = d10.slice(6);
  return [d10, `1${d10}`, `+1${d10}`, `(${a}) ${b}-${c}`, `${a}-${b}-${c}`, `${a}.${b}.${c}`];
}

async function findContactByPhone(number) {
  const variants = phoneVariants(number);
  if (!variants.length) return null;
  const res = await fetch(`${HS_BASE}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: hsHeaders(),
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: 'phone', operator: 'IN', values: variants }] },
        { filters: [{ propertyName: 'mobilephone', operator: 'IN', values: variants }] },
      ],
      properties: ['firstname', 'lastname', 'email', 'original_source_desc', 'hs_lead_status'],
      limit: 1,
    }),
  });
  if (!res.ok) throw new Error(`hubspot search ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.results?.[0] || null;
}

/** Create a note and associate it with a contact. Association type 202 = note→contact. */
async function createNoteOnContact(contactId, body) {
  const res = await fetch(`${HS_BASE}/crm/v3/objects/notes`, {
    method: 'POST',
    headers: hsHeaders(),
    body: JSON.stringify({
      properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body },
      associations: [
        {
          to: { id: String(contactId) },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`hubspot note ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Advance a NEW lead to ATTEMPTED_TO_CONTACT. Never downgrades a further-along status. */
async function markAttempted(contactId, currentStatus) {
  if (currentStatus && currentStatus !== 'NEW') return;
  const res = await fetch(`${HS_BASE}/crm/v3/objects/contacts/${contactId}`, {
    method: 'PATCH',
    headers: hsHeaders(),
    body: JSON.stringify({ properties: { hs_lead_status: 'ATTEMPTED_TO_CONTACT' } }),
  });
  if (!res.ok) throw new Error(`hubspot contact patch ${res.status}: ${await res.text()}`);
}

module.exports = { HS_BASE, phoneVariants, findContactByPhone, createNoteOnContact, markAttempted };
