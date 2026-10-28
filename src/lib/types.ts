export type TrackingType = 'checkbox' | 'number' | 'duration' | 'rating' | 'custom'
export type Frequency = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom'
export type Status = 'completed' | 'skipped' | 'planned'
export interface Category { id: string; name: string; color: string; icon: string }
export interface Schedule { frequency: Frequency; days: number[]; target: number; dates: string[] }
export interface ActivityTemplate {
  id: string; name: string; categoryId: string; icon: string; notes: string; unit: string
  tracking: TrackingType; favorite: boolean; order: number; kind: 'activity' | 'habit'
  state: 'active' | 'paused' | 'archived'; description: string; color: string
  startDate: string; endDate: string; schedule: Schedule; reminder: string; goal: number
  pauses: { start: string; end: string }[]
}
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'duration'
export interface CustomField { id: string; name: string; type: FieldType; options: string[] }
export type FieldValue = string | number | boolean
export interface ActivityLog {
  id: string; templateId: string; name: string; categoryId: string; date: string
  time: string; endTime: string; timeOfDay: string; status: Status; notes: string
  quantity?: number; unit: string; duration?: number; relatedId: string; duplicate: boolean
  fields: Record<string, FieldValue>; photo: string; createdAt: string; updatedAt: string
}
export interface WorkoutSet { id: string; reps: number; weight: number; duration: number }
export interface WorkoutExercise { id: string; name: string; sets: WorkoutSet[] }
export interface WorkoutTemplate { id: string; name: string; exercises: string[] }
export interface WorkoutSession {
  id: string; date: string; time: string; type: string; notes: string
  bodyWeight?: number; restDay: boolean; exercises: WorkoutExercise[]; createdAt: string
}
export interface Preferences {
  name: string; theme: 'light' | 'dark' | 'system'; timezone: string
  dateFormat: 'dd MMM yyyy' | 'MM/dd/yyyy' | 'dd/MM/yyyy'; notifications: boolean
  widgets: string[]; hiddenColumns: string[]; columnOrder: string[]
  columnSizes: Record<string, number>; lastBackup: string
}
export interface AppData {
  schemaVersion: 1; revision: number; categories: Category[]; templates: ActivityTemplate[]
  logs: ActivityLog[]; fields: CustomField[]; workouts: WorkoutSession[]
  workoutTemplates: WorkoutTemplate[]; preferences: Preferences
}
export interface LogFilter { query: string; category: string; template: string; status: string; from: string; to: string }
export const emptyFilter: LogFilter = { query: '', category: '', template: '', status: '', from: '', to: '' }
