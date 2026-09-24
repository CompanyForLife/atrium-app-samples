import { Routes } from '@angular/router';
import { DocsLayoutComponent } from './components/docs-layout/docs-layout.component';
import { DocPageComponent } from './pages/doc-page/doc-page.component';
import { SamplePageComponent } from './pages/sample-page/sample-page.component';
import specSections from './content/spec-content.generated.json';
import { SpecSection } from './content/spec-section';

const FIRST_SECTION_SLUG = (specSections as SpecSection[])[0].slug;

export const routes: Routes = [
    {
        path: '',
        component: DocsLayoutComponent,
        children: [
            { path: '', redirectTo: `docs/${FIRST_SECTION_SLUG}`, pathMatch: 'full' },
            { path: 'docs/:slug', component: DocPageComponent },
            { path: 'samples/:slug', component: SamplePageComponent },
        ]
    },
];
