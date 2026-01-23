let scheduleLogEnabled = false;
let longTaskLogEnabled = false;

export function setScheduleLogEnabled(enabled: boolean): void {
  scheduleLogEnabled = Boolean(enabled);
}

export function getScheduleLogEnabled(): boolean {
  return scheduleLogEnabled;
}

export function setLongTaskLogEnabled(enabled: boolean): void {
  longTaskLogEnabled = Boolean(enabled);
}

export function getLongTaskLogEnabled(): boolean {
  return longTaskLogEnabled;
}
