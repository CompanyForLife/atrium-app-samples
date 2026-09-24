import { Component, DestroyRef, ViewEncapsulation, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import specSections from '../../content/spec-content.generated.json';
import { SpecSection } from '../../content/spec-section';
import { TocStateService } from '../../services/toc-state.service';

const SECTIONS = specSections as SpecSection[];
const TOTAL_SECTIONS = SECTIONS.length;

@Component({
    selector: 'app-doc-page',
    imports: [RouterLink],
    templateUrl: './doc-page.component.html',
    styleUrl: './doc-page.component.scss',
    encapsulation: ViewEncapsulation.None
})
export class DocPageComponent {
    private route = inject(ActivatedRoute);
    private sanitizer = inject(DomSanitizer);
    private title = inject(Title);
    private tocState = inject(TocStateService);

    protected readonly totalSections = TOTAL_SECTIONS;

    private readonly slug = toSignal(
        this.route.paramMap.pipe(map(params => params.get('slug'))),
        { initialValue: null }
    );

    protected readonly section = computed<SpecSection | undefined>(() =>
        SECTIONS.find(section => section.slug === this.slug())
    );

    protected readonly previousSection = computed<SpecSection | undefined>(() => {
        const current = this.section();
        return current ? SECTIONS.find(s => s.number === current.number - 1) : undefined;
    });

    protected readonly nextSection = computed<SpecSection | undefined>(() => {
        const current = this.section();
        return current ? SECTIONS.find(s => s.number === current.number + 1) : undefined;
    });

    protected readonly safeHtml = computed(() => {
        const section = this.section();
        return section ? this.sanitizer.bypassSecurityTrustHtml(section.html) : null;
    });

    constructor() {
        effect(() => {
            const section = this.section();
            this.title.setTitle(section ? `${section.title} - Atrium dev docs` : 'Atrium dev docs');
            this.tocState.setHeadings(section?.headings ?? []);
        });

        inject(DestroyRef).onDestroy(() => this.tocState.clear());
    }
}
