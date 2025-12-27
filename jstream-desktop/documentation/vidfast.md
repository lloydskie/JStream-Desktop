# Vidfast Player Documentation

## Use one of the following domains for embed URLs:

`vidfast.pro, vidfast.in, vidfast.io, vidfast.me, vidfast.net, vidfast.pm, vidfast.xyz `

Complete reference guide for embedding and customizing VidFast players on your website.

## Endpoints

### Movie Embed

Endpoint: `https://vidfast.pro/movie/{id}?autoPlay=true`

Required Parameters: `{id}` Movie identifier from TMDB

Optional Parameters:

* `title`	Controls whether the media title is displayed
* `poster`	Determines if the poster image is shown
* `autoPlay`	Controls whether the media starts playing automatically
* `startAt`	Starts the video at the specified time in seconds
* `theme`	Changes the player's color (hex code format)
* `server`	Changes the default server for the player (set to server name)
* `hideServer`	Controls whether the server selector button is shown or hidden
* `fullscreenButton`	Controls whether the fullscreen button is shown or hidden
* `chromecast`	Controls whether the Chromecast button is shown or hidden
* `sub`	Sets the default subtitle (e.g. en, es, fr)

Examples:

* `https://vidfast.pro/movie/122361`
* `https://vidfast.pro/movie/122361?theme=16A085`

### TV Show Embed

Endpoints: `https://vidfast.pro/tv/{id}/{season}/{episode}?autoPlay=true`

Required Parameters:

* `{id}`	TV show identifier from IMDB or TMDB
* `{season}`	The season number
* `{episode}`	The episode number

Optional Parameters:

* `title`    Controls whether the media title is displayed
* `poster`	Determines if the poster image is shown
* `autoPlay`	Controls whether the media starts playing automatically
* `startAt`	Starts the video at the specified time in seconds
* `theme`	Changes the player's color (hex code format)
* `nextButton`	Displays the "Next Episode" button when 90% of the current episode has been watched
* `autoNext`	Automatically plays the next episode when the current one ends (requires nextButton)
* `server`	Changes the default server for the player (set to server name)
* `hideServer`	Controls whether the server selector button is shown or hidden
* `fullscreenButton`	Controls whether the fullscreen button is shown or hidden
* `chromecast`	Controls whether the Chromecast button is shown or hidden
* `sub`	Sets the default subtitle (e.g. en, es, fr)

Examples:

`https://vidfast.pro/tv/119051/1/5`

`https://vidfast.pro/tv/119051/1/5?nextButton=true&autoNext=true`

## Implementation

### Basic Implementation

Copy and paste this code into your HTML where you want the player to appear:

```
<iframe 
  src="https://vidfast.pro/movie/533535" 
  width="100%" 
  height="100%" 
  frameborder="0" 
  allowfullscreen 
  allow="encrypted-media"
></iframe>
```

### Responsive Implementation

Wrap the iframe in this container to maintain the correct 16:9 aspect ratio:

```
<!-- 16:9 Aspect Ratio Container -->
<div style="position: relative; padding-bottom: 56.25%; height: 0;">
  <iframe
    src="https://vidfast.pro/movie/533535"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
    frameborder="0"
    allowfullscreen
    allow="encrypted-media"
  ></iframe>
</div>
```

Responsive with Tailwind CSS:

```
<div className="relative w-full pt-[56.25%]">
  <iframe
    src="https://vidfast.pro/movie/533535" 
    className="absolute top-0 left-0 w-full h-full"
    frameBorder="0"
    allowFullScreen
    allow="encrypted-media"
  ></iframe>
</div>
```

## Customization

### Color Themes

Customize the player's color by adding the theme parameter:

`<iframe src="https://vidfast.pro/movie/840326?theme=E50914"></iframe>`

### Advanced Features

Complete Feature Example:

```
<iframe src="https://vidfast.pro/tv/tt4052886/1/5?autoPlay=true&title=true&poster=true&theme=E50914&nextButton=true&autoNext=true" width="100%" height="100%" frameborder="0" allowfullscreen allow="encrypted-media"></iframe>
```
