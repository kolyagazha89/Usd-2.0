const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type ApiError = Error & { status?: number };

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;

export type Role = 'ADMIN' | 'JUDGE' | 'PARTICIPANT';

export type User = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  emailVerifiedAt?: string | null;
  participantId?: string | null;
};

export type AuthResponse = {
  success?: boolean;
  accessToken: string;
  user: User;
};

export type Dashboard = {
  success: boolean;
  generatedAt: string;
  overview: {
    participants: number;
    cars: number;
    stages: number;
    registrations: number;
    results: number;
    records: number;
  };
  attention: {
    openStages: number;
    pendingInspections: number;
    failedInspections: number;
    resultsToday: number;
    activeDisqualifications: number;
    unresolvedImports: number;
  };
  upcomingStages: Array<{
    id: string;
    stageNumber: number;
    name: string;
    city: string;
    date: string;
    registrationOpen: boolean;
  }>;
  recentStages: Array<{
    id: string;
    stageNumber: number;
    name: string;
    city: string;
    date: string;
  }>;
};

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await refresh();
    if (refreshed) return request<T>(path, init, false);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message ?? 'Произошла ошибка запроса') as ApiError;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export async function login(email: string, password: string) {
  const result = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  accessToken = result.accessToken;
  return result.user;
}

export async function refresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = request<AuthResponse>('/auth/refresh', { method: 'POST' }, false)
    .then((result) => {
      accessToken = result.accessToken;
      return result;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' }, false);
  } finally {
    accessToken = null;
  }
}

export async function me() {
  return request<User>('/auth/me');
}

export async function getDashboard() {
  return request<Dashboard>('/statistics/dashboard');
}

export async function getDataQuality() {
  return request<{
    success: boolean;
    generatedAt: string;
    counts: { total: number; error: number; warning: number; info: number };
    healthy: boolean;
  }>('/statistics/data-quality/report');
}
