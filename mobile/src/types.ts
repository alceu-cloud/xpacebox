export type Attendance = "AGENDADO" | "COMPARECEU" | "FALTOU" | "CANCELADO" | "NAO_INFORMADO";

export type Student = {
  id: string;
  studentName: string;
  startsOn: string;
  endsOn: string | null;
};

export type Schedule = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  roomName: string;
  instructorName: string;
  color: string;
  capacity: number | null;
};

export type Group = {
  id: string;
  name: string;
  modality: string;
  schedules: Schedule[];
  students: Student[];
};

export type Trial = {
  id: string;
  leadName: string;
  classScheduleId: string;
  scheduledOn: string;
  attendanceStatus: Attendance;
};

export type AgendaResponse = {
  success: true;
  groups: Group[];
  trialAppointments: Trial[];
};

export type OverviewResponse = {
  success: true;
  profileName: string;
  metrics: {
    trialsThisWeek: number;
    activeClients: number;
    newClientsThisMonth: number;
    newLeadsThisMonth: number;
  };
  notifications: Array<{ id: string; title: string; detail: string; createdAt: string }>;
};
