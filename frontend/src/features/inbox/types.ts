export type StaffNotification = {
  id: string;
  clinic_id: string;
  user_id: string;
  category: string;
  event_type: string;
  title: string;
  body: string;
  link_path?: string | null;
  payload?: Record<string, unknown>;
  actor_id?: string | null;
  read_at?: string | null;
  created_at?: string | null;
};
