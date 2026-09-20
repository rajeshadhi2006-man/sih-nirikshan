import { apiClient, API_BASE_URL } from './client';

export const reportsApi = {
  getAttendanceReport: async (department?: string) => {
    const url = `/api/reports/attendance${department ? `?department=${department}` : ''}`;
    const res = await apiClient.get(url);
    return res.data;
  },
  getExportCsvUrl: (reportType = 'attendance') => {
    return `${API_BASE_URL}/api/reports/export-csv?report_type=${reportType}`;
  },
};
