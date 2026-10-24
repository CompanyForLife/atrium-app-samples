import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
    DEFAULT_WEB_APP_ENDPOINTS,
    ENV_VARS_NOTE,
    SAMPLES,
    SampleContent
} from '../../content/samples';

@Component({
    selector: 'app-sample-page',
    imports: [RouterLink],
    templateUrl: './sample-page.component.html',
    styleUrl: './sample-page.component.scss'
})
export class SamplePageComponent {
    private route = inject(ActivatedRoute);
    private title = inject(Title);

    protected readonly envVarsNote = ENV_VARS_NOTE;

    private readonly slug = toSignal(
        this.route.paramMap.pipe(map(params => params.get('slug'))),
        { initialValue: null }
    );

    protected readonly sample = computed<SampleContent | undefined>(() =>
        SAMPLES.find(sample => sample.slug === this.slug())
    );

    protected readonly endpoints = computed(() => {
        const sample = this.sample();
        return sample?.endpoints ?? DEFAULT_WEB_APP_ENDPOINTS;
    });

    protected readonly endpointsIntro = computed(
        () => this.sample()?.endpointsIntro ?? 'Same runtime contract as the other hello samples:'
    );

    constructor() {
        effect(() => {
            const sample = this.sample();
            this.title.setTitle(sample ? `${sample.title} - Atrium dev docs` : 'Atrium dev docs');
        });
    }
}
