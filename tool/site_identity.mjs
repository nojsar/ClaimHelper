/**
 * One source of truth for the publisher identity every page's structured data
 * carries. Search engines consolidate a brand entity from these signals, so a
 * profile listed in `sameAs` must be a real, verified GetMyYes account — a
 * wrong sameAs is worse than a missing one. Each entry below was confirmed
 * live before being added; the Facebook Page is deliberately absent because it
 * could not be verified without logging in.
 */

export const siteOrigin = "https://getmyyes.com";

export const sameAs = [
  "https://mastodon.social/@getmyyes",
  "https://bsky.app/profile/getmyyes.com",
  "https://x.com/get_my_yes",
  "https://www.instagram.com/getmyyes/",
];

export const organizationLogo = {
  "@type": "ImageObject",
  url: `${siteOrigin}/icons/Icon-512.png`,
  width: 512,
  height: 512,
};

/** Reference sections share the site-wide card; only guides earn their own. */
export const defaultSocialImage = `${siteOrigin}/og-image.png`;

export const articleAuthor = () => ({
  "@type": "Organization",
  name: "GetMyYes",
  url: `${siteOrigin}/`,
  sameAs,
});

export const articlePublisher = () => ({
  "@type": "Organization",
  name: "GetMyYes",
  url: `${siteOrigin}/`,
  logo: organizationLogo,
  sameAs,
});
