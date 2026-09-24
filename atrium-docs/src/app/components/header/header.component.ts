import { Component, ElementRef, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';
import { SearchModalComponent } from '../search-modal/search-modal.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SAMPLES } from '../../content/samples';

@Component({
    selector: 'app-header',
    imports: [RouterLink, SvgIconComponent, SearchModalComponent, SidebarComponent],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss',
    host: {
        '(document:click)': 'onDocumentClick($event)',
        '(document:keydown)': 'onDocumentKeydown($event)',
        '(window:scroll)': 'onWindowScroll()'
    }
})
export class HeaderComponent {
    private elementRef = inject(ElementRef<HTMLElement>);

    protected readonly samplesOpen = signal(false);
    protected readonly searchOpen = signal(false);
    protected readonly scrolled = signal(false);
    protected readonly mobileNavOpen = signal(false);
    protected readonly searchShortcutLabel = isPlatformBrowser(inject(PLATFORM_ID)) && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
        ? '⌘K'
        : 'Ctrl K';

    protected readonly samples = SAMPLES;

    constructor() {
        inject(Router).events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe(() => this.mobileNavOpen.set(false));
    }

    toggleSamples(): void {
        this.samplesOpen.update(open => !open);
    }

    closeSamples(): void {
        this.samplesOpen.set(false);
    }

    toggleMobileNav(): void {
        this.mobileNavOpen.update(open => !open);
    }

    closeMobileNav(): void {
        this.mobileNavOpen.set(false);
    }

    onDocumentClick(event: MouseEvent): void {
        if (this.samplesOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
            this.closeSamples();
        }
        if (this.mobileNavOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
            this.closeMobileNav();
        }
    }

    openSearch(): void {
        this.searchOpen.set(true);
    }

    openSearchFromMobileNav(): void {
        this.closeMobileNav();
        this.openSearch();
    }

    closeSearch(): void {
        this.searchOpen.set(false);
    }

    onDocumentKeydown(event: KeyboardEvent): void {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            this.openSearch();
        }
    }

    onWindowScroll(): void {
        this.scrolled.set(window.scrollY > 8);
    }
}
