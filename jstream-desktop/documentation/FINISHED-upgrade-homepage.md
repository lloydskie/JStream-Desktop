# **Homepage Reconstruction**

Reconstruct the Home page for new set of feeds, these are the new feeds. Implement thesame design, features and structure, this is the new order of feeds:

* Continue Watching {stays thesame}
* Top Searches {this feed would be the trending movie and tv shows from tmdb}

  * Get the trending movies and tv show.

    ```
    https://api.themoviedb.org/3/trending/movie/{time_window}
    ```
    ```
    https://api.themoviedb.org/3/trending/tv/{time_window}
    ```
    Then `time_window` path params would be set to `day`. To get the trending movies and tv shows today. Make the Top Searches fetch 5 trending movies today and 5 trending TV Shows today, which will be put in the feed in a random arrangement.
  * The structure, design, components and etc. of the Top Searches feed would be the same as the Continue Watching feed.
* Top 10 TV Shows in the Philippines Today {this is the Top 10 feed just rename it nothing else it just stays thesame}
* New on Netflix {display recent movies or tv shows that are pure netflix feeds}

  * Get the Netflix provider id using the TMDB GET `/watch/providers/movie/list` or `/watch/providers/tv/list` and find provider where `provider_name = "Netflix"`
* Today's Top Picks for You
* Romantic Fantasy TV {these are mostly k-drama feeds you may use korean language to fetch from tmdb}
* Bacause you watched {last recent anime the user watched}
