# Rive Stream

## Biggest Streaming API

We offer free streaming links for movies and episodes that can be effortlessly integrated into your website through our embed links, API



# API Documentaion

Rive API give you the lowdown on all the methods, request formats, and both required and optional parameters.

## 1. Movie Embed

TmdbId is required from [The Movie Database](https://developer.themoviedb.org/docs/getting-started) API.

### Endpoint

https://www.rivestream.app/embed?type=movie&id={tmdbId}

### Examples

https://www.rivestream.app/embed?type=movie&id=533535

https://www.rivestream.app/embed?type=movie&id=278

### Code Examples

<iframe src="https://www.rivestream.app/embed?type=movie&id=533535" allowfullscreen ></iframe>


## 2. Tv Show Embed

TmdbId is required from [The Movie Database](https://developer.themoviedb.org/docs/getting-started) API. season and episode number should not be empty.

### Endpoint

https://www.rivestream.app/embed?type=tv&id={tmdbId}&season={season}&episode={episode}

### Examples

https://www.rivestream.app/embed?type=tv&id=1396&season=1&episode=1

https://www.rivestream.app/embed?type=tv&id=1399&season=1&episode=1

### Code Examples

<iframe src="https://www.rivestream.app/embed?type=tv&id=1396&season=1&episode=1" allowfullscreen ></iframe>



# Download API

Download movies and TV shows from multiple aggregator servers. This API documentation details all methods, request formats, and parameters required to access and download streams from various reliable sources.

## 1. Movie Download

TmdbId is required from [The Movie Database](https://developer.themoviedb.org/docs/getting-started) API.

### Endpoint

https://www.rivestream.app/download?type=movie&id={tmdbId}

### Examples

https://www.rivestream.app/download?type=movie&id=533535

https://www.rivestream.app/download?type=movie&id=278

### Code Examples

<iframe src="https://www.rivestream.app/download?type=movie&id=533535" allowfullscreen ></iframe>

## 2. Tv Show Download

TmdbId is required from [The Movie Database](https://developer.themoviedb.org/docs/getting-started) API. season and episode number should not be empty.

### Endpoint

https://www.rivestream.app/download?type=tv&id={tmdbId}&season={season}&episode={episode}

### Examples

https://www.rivestream.app/download?type=tv&id=1396&season=1&episode=1

https://www.rivestream.app/download?type=tv&id=1399&season=1&episode=1

### Code Examples

<iframe src="https://www.rivestream.app/download?type=tv&id=1396&season=1&episode=1" allowfullscreen ></iframe>
