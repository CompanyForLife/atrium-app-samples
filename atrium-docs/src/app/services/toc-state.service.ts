import { Injectable, signal } from '@angular/core';
import { SpecHeading } from '../content/spec-section';

@Injectable({ providedIn: 'root' })
export class TocStateService {
    readonly headings = signal<SpecHeading[]>([]);

    setHeadings(headings: SpecHeading[]): void {
        this.headings.set(headings);
    }

    clear(): void {
        this.headings.set([]);
    }
}
