import type { ActivityTemplate, AppData, Category, ActivityLog } from './types'
export const categories: Category[] = [
  { id: 'hair', name: 'Hair care', color: '#d99e63', icon: 'sparkles' },
  { id: 'skin', name: 'Skin care', color: '#b29bcb', icon: 'droplet' },
  { id: 'personal', name: 'Personal care', color: '#db939b', icon: 'heart' },
  { id: 'fitness', name: 'Fitness & gym', color: '#7ca88d', icon: 'dumbbell' },
  { id: 'health', name: 'Health & routine', color: '#80afc3', icon: 'leaf' },
  { id: 'devices', name: 'Devices & maintenance', color: '#9ca6c9', icon: 'headphones' },
]
const names: Record<string, string[]> = {
  hair: ['Hair oil applied', 'Hair washed', 'Hair oil applied at night', 'Hair washed the next morning', 'Hair serum applied', 'Hair mask applied', 'Scalp massage completed', 'Hair care routine completed'],
  skin: ['Cleanser applied', 'Moisturizer applied', 'Cleanser + moisturizer applied', 'Cleanser + moisturizer applied before sleep', 'Sunscreen applied', 'Face wash completed', 'Skin care routine completed'],
  personal: ['Shower completed', 'Nails trimmed', 'Beard trimmed', 'Personal hygiene completed'],
  fitness: ['Gym attended', 'Workout completed', 'Chest workout', 'Back workout', 'Shoulder workout', 'Leg workout', 'Arm workout', 'Abs workout', 'Cardio completed', 'Stretching completed', 'Rest day', 'Weight recorded'],
  health: ['Water intake recorded', 'Protein target achieved', 'Vitamins or supplements taken', 'Slept on time', 'Woke up on time', 'Walking completed', 'Meditation completed'],
  devices: ['AirPods fully charged', 'Phone fully charged', 'Laptop charged', 'Device cleaned', 'Device maintenance completed'],
}
export function newTemplate(overrides: Partial<ActivityTemplate> = {}): ActivityTemplate {
  return { id: crypto.randomUUID(), name: '', categoryId: 'personal', icon: 'sparkles', notes: '', unit: '', tracking: 'checkbox', favorite: false, order: 100, kind: 'activity', state: 'active', description: '', color: '#44725b', startDate: '', endDate: '', schedule: { frequency: 'daily', days: [1, 2, 3, 4, 5], target: 3, dates: [] }, reminder: '', goal: 1, pauses: [], ...overrides }
}
export function createSeed(): AppData {
  const templates = Object.entries(names).flatMap(([categoryId, list]) => list.map((name, order) => newTemplate({ id: `${categoryId}-${order}`, name, categoryId, order, icon: categories.find(c => c.id === categoryId)!.icon, tracking: name === 'Weight recorded' || name === 'Water intake recorded' ? 'number' : 'checkbox', unit: name === 'Weight recorded' ? 'kg' : name === 'Water intake recorded' ? 'ml' : '' })))
  const make = (id: string, templateId: string, date: string, timeOfDay = '', relatedId = '', duplicate = false, notes = ''): ActivityLog => {
    const t = templates.find(t => t.id === templateId)!
    return { id, templateId, name: t.name, categoryId: t.categoryId, date, time: '', endTime: '', timeOfDay, status: 'completed', notes, unit: '', relatedId, duplicate, fields: {}, photo: '', createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' }
  }
  return {
    schemaVersion: 1, revision: 0, categories, templates, fields: [], workouts: [],
    logs: [
      make('seed-1', 'devices-0', '2026-10-18'),
      make('seed-2', 'hair-0', '2026-10-20', 'Night', 'seed-3'),
      make('seed-3', 'hair-1', '2026-10-21', 'Morning', 'seed-2'),
      make('seed-4', 'hair-0', '2026-10-23'), make('seed-5', 'hair-1', '2026-10-23'),
      make('seed-6', 'hair-0', '2026-10-26', '', '', true, 'Original entry: hair oil applied and hair washed on 26 October; timing unspecified.'),
      make('seed-7', 'hair-1', '2026-10-26'),
      make('seed-8', 'skin-2', '2026-10-27', 'Evening'),
      make('seed-9', 'hair-0', '2026-10-26', 'Night', 'seed-10', true, 'Separate original entry: hair oil at night; hair washed the following morning. May overlap the other 26 October oil entry.'),
      make('seed-10', 'hair-1', '2026-10-27', 'Morning', 'seed-9'),
    ],
    workoutTemplates: [
      ['Chest', 'Bench press', 'Incline dumbbell press', 'Cable fly'], ['Back', 'Lat pulldown', 'Seated cable row', 'Dumbbell row'],
      ['Shoulders', 'Overhead press', 'Lateral raise', 'Reverse fly'], ['Legs', 'Squat', 'Romanian deadlift', 'Leg press'],
      ['Arms', 'Bicep curl', 'Tricep pushdown', 'Hammer curl'], ['Abs', 'Crunch', 'Leg raise', 'Plank'],
      ['Full body', 'Squat', 'Bench press', 'Row'], ['Cardio', 'Treadmill', 'Cycling'],
    ].map(([name, ...exercises]) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, exercises })),
    preferences: { name: '', theme: 'light', timezone: 'Asia/Kolkata', dateFormat: 'dd MMM yyyy', notifications: false, widgets: ['weekly', 'categories', 'recent', 'habits'], hiddenColumns: [], columnOrder: [], columnSizes: {}, lastBackup: '' },
  }
}
