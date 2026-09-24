import { Component } from '@angular/core';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

interface FooterLink {
    label: string;
    href: string;
}

const STATIC_WEB_URL = 'https://coho.life/';

@Component({
    selector: 'app-footer',
    imports: [SvgIconComponent],
    templateUrl: './footer.component.html',
    styleUrl: './footer.component.scss'
})
export class FooterComponent {
    protected readonly currentYear = new Date().getFullYear();

    protected readonly socialLinks = [
        { name: 'icon-discord', href: 'https://coho.life/discord', title: 'Join our Discord community' },
        { name: 'icon-youtube', href: 'https://coho.life/support/tutorials/', title: 'Watch our tutorials' },
        { name: 'icon-linkedin', href: 'https://uk.linkedin.com/company/cohohomes', title: 'Connect with us on LinkedIn' },
        { name: 'icon-mail', href: 'mailto:team@coho.life', title: 'Email us' },
    ];

    protected readonly aboutLinks: FooterLink[] = [
        { label: 'Who we help', href: `${STATIC_WEB_URL}management/who-we-help/` },
        { label: 'What we do', href: `${STATIC_WEB_URL}management/what-we-do/` },
        { label: 'Pricing', href: `${STATIC_WEB_URL}management/pricing/` },
    ];

    protected readonly resourceLinks: FooterLink[] = [
        { label: 'Resources', href: `${STATIC_WEB_URL}management/resources/` },
        { label: 'FAQs', href: `${STATIC_WEB_URL}management/faqs/` },
        { label: 'News & updates', href: `${STATIC_WEB_URL}latest-news/` },
        { label: 'Longer reads', href: `${STATIC_WEB_URL}articles/` },
        { label: 'Release notes', href: `${STATIC_WEB_URL}release-notes/` },
    ];

    protected readonly legalLinks: FooterLink[] = [
        { label: 'Terms and conditions', href: `${STATIC_WEB_URL}legal/terms-and-conditions/` },
        { label: 'Subscription terms', href: `${STATIC_WEB_URL}legal/subscription-terms/` },
        { label: 'Privacy policy', href: `${STATIC_WEB_URL}legal/privacy-policy/` },
        { label: 'Website terms of use', href: `${STATIC_WEB_URL}legal/terms-of-use/` },
        { label: 'Acceptable use policy', href: `${STATIC_WEB_URL}legal/acceptable-use-policy/` },
    ];

    protected readonly supportLinks: FooterLink[] = [
        { label: 'Support', href: `${STATIC_WEB_URL}support/` },
        { label: 'Contact us', href: `${STATIC_WEB_URL}contact/` },
    ];
}
