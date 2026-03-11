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
    setStudentsFromDb: (id, entries) =>
        api(`/sessions/${id}/students-from-db`, { method: 'PUT', body: { entries } }),
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

// ── Configuration APIs ───────────────────────────────────────

export const configApi = {
    // XLSX column detection
    detectColumns: (fileData) =>
        api('/config/xlsx/detect-columns', { method: 'POST', body: { fileData } }),

    // Student master CRUD
    importStudents: (data) =>
        api('/config/students/import', { method: 'POST', body: data }),
    getStudents: (params) => {
        const qs = new URLSearchParams(params).toString();
        return api(`/config/students?${qs}`);
    },
    getStudentBranches: (year) =>
        api(`/config/students/branches?year=${year}`),
    getStudentYears: () =>
        api('/config/students/years'),

    // Year → Branch → Subject mapping
    importYearSubjects: (data) =>
        api('/config/year-subjects/import', { method: 'POST', body: data }),
    setYearSubjects: (year, mappings) =>
        api(`/config/year-subjects/${year}`, { method: 'PUT', body: { mappings } }),
    getYearSubjects: (year, branchId) => {
        let url = `/config/year-subjects/${year}`;
        if (branchId) url += `?branchId=${branchId}`;
        return api(url);
    },
    getAllYearSubjects: () => api('/config/year-subjects'),
    deleteYearSubjects: (year) =>
        api(`/config/year-subjects/${year}`, { method: 'DELETE' }),
    getConfiguredYears: () => api('/config/years'),
    getBranchesForYear: (year) => api(`/config/branches-for-year/${year}`),

    // Student electives
    importElectives: (data) =>
        api('/config/electives/import', { method: 'POST', body: data }),
    getElectives: (year, type) => {
        let url = `/config/electives?year=${year}`;
        if (type && type !== 'ALL') url += `&type=${type}`;
        return api(url);
    },

    // Exam timetable
    importTimetable: (data) =>
        api('/config/timetable/import', { method: 'POST', body: data }),
    getTimetable: (year) => {
        let url = '/config/timetable';
        if (year) url += `?year=${year}`;
        return api(url);
    },
    getTimetableByDate: (date, slot) => {
        let url = `/config/timetable/by-date?date=${date}`;
        if (slot) url += `&slot=${slot}`;
        return api(url);
    },
    getTimetableDates: (year) => {
        let url = '/config/timetable/dates';
        if (year) url += `?year=${year}`;
        return api(url);
    },
    getTimetableSlots: (date, year) => {
        let url = `/config/timetable/slots?date=${date}`;
        if (year) url += `&year=${year}`;
        return api(url);
    },
    getTimetableYears: () => api('/config/timetable/years'),
    deleteTimetable: (year) =>
        api(`/config/timetable/${year}`, { method: 'DELETE' }),

    // Reset entire database
    resetDatabase: () => api('/config/reset', { method: 'DELETE' }),
};
