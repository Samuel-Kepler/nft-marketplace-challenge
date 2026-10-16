export class EventDeduplicator {
  private versionMap = new Map<string, number>();
  private eventIdSet = new Set<string>();
  private readonly maxEventIds = 200;

  shouldProcess(resource: string, id: string, version: number, eventId: string): boolean {
    const key = `${resource}:${id}`;

    if (this.eventIdSet.has(eventId)) {
      return false;
    }

    const currentVersion = this.versionMap.get(key) ?? 0;
    if (version <= currentVersion) {
      return false;
    }

    this.versionMap.set(key, version);

    this.eventIdSet.add(eventId);
    if (this.eventIdSet.size > this.maxEventIds) {
      const firstId = this.eventIdSet.values().next().value;
      if (firstId !== undefined) this.eventIdSet.delete(firstId);
    }

    return true;
  }

  clear(): void {
    this.versionMap.clear();
    this.eventIdSet.clear();
  }
}
