import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TocComponent } from '../toc/toc.component';
import { TocStateService } from '../../services/toc-state.service';

@Component({
    selector: 'app-docs-layout',
    imports: [RouterOutlet, SidebarComponent, TocComponent],
    templateUrl: './docs-layout.component.html',
    styleUrl: './docs-layout.component.scss'
})
export class DocsLayoutComponent {
    protected readonly tocHeadings = inject(TocStateService).headings;
}
