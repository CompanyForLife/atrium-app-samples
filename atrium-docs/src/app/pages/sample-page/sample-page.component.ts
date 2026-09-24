import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ENV_VARS_NOTE, SAMPLES, SampleContent } from '../../content/samples';

const ENDPOINTS = [
    '/health',
    'signed /webhooks/atrium/*',
    'signed native config at /config/schema and /config',
    'signed iframe quick view at /ui',
    'external app-owned page at /configure'
];

@Component({
    selector: 'app-sample-page',
    imports: [RouterLink],
    templateUrl: './sample-page.component.html',
    styleUrl: './sample-page.component.scss'
})
export class SamplePageComponent {
    private route = inject(ActivatedRoute);
    private title = inject(Title);

    protected readonly endpoints = ENDPOINTS;
    protected readonly envVarsNote = ENV_VARS_NOTE;

    private readonly slug = toSignal(
        this.route.paramMap.pipe(map(params => params.get('slug'))),
        { initialValue: null }
    );

    protected readonly sample = computed<SampleContent | undefined>(() =>
        SAMPLES.find(sample => sample.slug === this.slug())
    );

    constructor() {
        effect(() => {
            const sample = this.sample();
            this.title.setTitle(sample ? `${sample.title} - Atrium dev docs` : 'Atrium dev docs');
        });
    }
}
