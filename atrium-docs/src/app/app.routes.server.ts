import { RenderMode, ServerRoute } from '@angular/ssr';
import specSections from './content/spec-content.generated.json';
import { SpecSection } from './content/spec-section';

const SAMPLE_SLUGS = ['hello-node', 'hello-python', 'hello-go', 'hello-dotnet'];

const DOC_SLUGS = (specSections as SpecSection[]).map(section => section.slug);

export const serverRoutes: ServerRoute[] = [
  {
    path: 'docs/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => DOC_SLUGS.map(slug => ({ slug }))
  },
  {
    path: 'samples/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => SAMPLE_SLUGS.map(slug => ({ slug }))
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
