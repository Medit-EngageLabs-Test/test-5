/** A contact as returned by the API, including the server-assigned id and timestamps. */
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The editable fields of a contact — the payload sent when creating or updating one. */
export interface ContactForm {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
}
