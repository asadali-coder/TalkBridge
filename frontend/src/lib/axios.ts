import axios from "axios";
export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  withCredentials: true,
});
export function errorMessage(error: unknown) {
  return axios.isAxiosError(error)
    ? error.response?.data?.message || error.message
    : "Something went wrong";
}
