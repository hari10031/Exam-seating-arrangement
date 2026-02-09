/**
 * API helper — centralises all fetch calls.
 */
const BASE = '/api';

async function api(path, options = {}) {
    const { method = 'GET', body } = options;
    const config = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) config.body = JSON.stringify(body);

    const res = await fetch(`${BASE}${path}`, config);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Request failed');
    }

    // Handle binary responses (PDF, Excel)
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/pdf') || contentType.includes('spreadsheetml')) {
        return res.blob();
    }
    return res.json();
}

export const roomsApi = {
    getAll: () => api('/rooms'),
    create: (data) => api('/rooms', { method: 'POST', body: data }),
    update: (id, data) => api(`/rooms/${id}`, { method: 'PUT', body: data }),
    delete: (id) => api(`/rooms/${id}`, { method: 'DELETE' }),
};

export const branchesApi = {
    getAll: () => api('/branches'),
    create: (data) => api('/branches', { method: 'POST', body: data }),
    update: (id, data) => api(`/branches/${id}`, { method: 'PUT', body: data }),
    delete: (id) => api(`/branches/${id}`, { method: 'DELETE' }),
};

export const subjectsApi = {
    getAll: () => api('/subjects'),
    create: (data) => api('/subjects', { method: 'POST', body: data }),
    update: (id, data) => api(`/subjects/${id}`, { method: 'PUT', body: data }),
    delete: (id) => api(`/subjects/${id}`, { method: 'DELETE' }),
};

export const sessionsApi = {
    getAll: () => api('/sessions'),
    getById: (id) => api(`/sessions/${id}`),
    create: (data) => api('/sessions', { method: 'POST', body: data }),
    update: (id, data) => api(`/sessions/${id}`, { method: 'PUT', body: data }),
    delete: (id) => api(`/sessions/${id}`, { method: 'DELETE' }),
    assignRooms: (id, roomIds) => api(`/sessions/${id}/rooms`, { method: 'PUT', body: { roomIds } }),
    getRooms: (id) => api(`/sessions/${id}/rooms`),
    assignBranchSubjects: (id, mappings) =>
        api(`/sessions/${id}/branch-subjects`, { method: 'PUT', body: { mappings } }),
    getBranchSubjects: (id) => api(`/sessions/${id}/branch-subjects`),
    setStudents: (id, entries) =>
        api(`/sessions/${id}/students`, { method: 'PUT', body: { entries } }),
    getStudents: (id) => api(`/sessions/${id}/students`),
    previewRolls: (id, data) =>
        api(`/sessions/${id}/students/preview`, { method: 'POST', body: data }),
    allocate: (id) => api(`/sessions/${id}/allocate`, { method: 'POST' }),
    getAllocations: (id) => api(`/sessions/${id}/allocations`),
    getRoomGrid: (id, roomId) => api(`/sessions/${id}/allocations/grid/${roomId}`),
    getReport: (id) => api(`/sessions/${id}/report`),
    exportExcel: (id) => api(`/sessions/${id}/export/excel`),
    exportPdf: (id) => api(`/sessions/${id}/export/pdf`),
};
