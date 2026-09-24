import { Component, computed, ElementRef, afterNextRender, inject, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SEARCH_INDEX, SearchEntry } from '../../content/search-index';

@Component({
    selector: 'app-search-modal',
    templateUrl: './search-modal.component.html',
    styleUrl: './search-modal.component.scss'
})
export class SearchModalComponent {
    readonly closed = output<void>();

    private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

    protected readonly query = signal('');

    protected readonly results = computed<SearchEntry[]>(() => {
        const term = this.query().trim().toLowerCase();
        if (!term) {
            return [];
        }
        return SEARCH_INDEX
            .filter(entry => entry.title.toLowerCase().includes(term))
            .slice(0, 20);
    });

    private router = inject(Router);

    constructor() {
        afterNextRender(() => this.inputRef()?.nativeElement.focus());
    }

    select(entry: SearchEntry): void {
        this.router.navigate(entry.path, entry.fragment ? { fragment: entry.fragment } : {});
        this.close();
    }

    close(): void {
        this.closed.emit();
    }

    onInput(event: Event): void {
        this.query.set((event.target as HTMLInputElement).value);
    }

    onBackdropClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.close();
        }
    }
}
