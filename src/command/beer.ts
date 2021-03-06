import { AbstractCommand } from "./abstract_command";
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Message, PartialMessage, MessageEmbed } from "discord.js";
import { getCommand, commandCharacter } from "../util/command";
import { CommandArgs } from "../util/command_args";

export interface Beer {
  name: string;
  url: string;
  img: string;
  style: string;
  abv: number;
  brewer: string;
  location: string;
  score: number;
}

export class BeerCommand implements AbstractCommand {
  should_execute(msg: Message | PartialMessage): boolean {
    return getCommand(msg).toLowerCase() == "beer";
  }

  execute(msg: Message | PartialMessage): void {
    const command_args = new CommandArgs(msg.client, msg.content);
    command_args.pop(); // Remove command char
    const beer = command_args.restToString();
    this.getBeer(beer).then(beer => {
      const reply = new MessageEmbed();
      reply.setTitle(beer.name);
      reply.setURL(beer.url);
      // reply.setImage(beer.img);
      reply.setThumbnail(beer.img);
      reply.addFields(
        {name: "Style", value: beer.style, inline: true},
        {name: "ABV", value: beer.abv, inline: true},
        {name: '\u200B', value: '\u200B' },
        {name: "Brewer", value: `${beer.brewer}\n${beer.location}`, inline: true},
        {name: "Score", value: beer.score, inline: true}
      );
      msg.channel.send(reply);
    }).catch(err => {
      msg.reply("We are unable to find a beer with that name");
    });
  }
  help(): string {
    return commandCharacter() + "beer <beer name> : Searches BeerAdvocate for your beer and returns the first result";
  }

  private getBeer(name: string): Promise<Beer> {
    return new Promise<Beer>((resolve, reject) => {
      const searchURL = `https://www.beeradvocate.com/search/?q=${name}`;
      axios(searchURL).then((resp) => {
        if (resp.request.res.responseUrl.includes("search")) {
          console.log("Search results page");
          return this.parseSearchPage(resp.data).then(beer => resolve(beer)).catch(err => reject(err));
        } else {
          return resolve(this.parseBeerPage(resp.data));
        }
      })
    });
  }

  private parseSearchPage(html: string): Promise<Beer> {
    const $ = cheerio.load(html);
    const firstBeer = $('#ba-content > div:nth-child(3) > div:nth-child(1) > a:nth-child(1)').attr('href');
    return new Promise<Beer>((resolve, reject) => {
      axios(`https://www.beeradvocate.com${firstBeer}`).then((resp) => {
        resolve(this.parseBeerPage(resp.data));
      }).catch((err) => {
        reject("Unable to find first beer page");
      });
    });
  }

  private parseBeerPage(html: string): Beer {
    const $ = cheerio.load(html);
    const titles = $('.beerstats > dt');
    const values = $('.beerstats > dd');
    let style, abv, brewer, location, score;
    titles.each((index: number, elem: cheerio.Element) => {
      const text = $(elem).text().toLowerCase();
      if (text.includes("style")) {
        style = $(values[index]).text().trim().replace(/Ranked #[0-9]+/, "");
      } else if (text.includes("abv")) {
        abv = parseFloat($(values[index]).text().replace(/%/, ""));
      } else if (text.includes("from")) {
        brewer = $(values[index]).text().trim();
        location = $(values[index + 1]).text().trim();
      } else if (text.includes("score")) {
        score = $(values[index]).text().trim().replace(/Ranked #[0-9,]+/, "");
      }
    });
    const img = $('#main_pic_norm > div > img').attr('src') == undefined ? $('#main_pic_norm > img').attr('src') : $('#main_pic_norm > div > img').attr('src');
    const url = (Array.from($('meta')).filter(elemTemp => {
      const elem = elemTemp as cheerio.TagElement;
      return elem.attribs['property'] && elem.attribs['property'] == 'og:url'
    }) as cheerio.TagElement[])[0].attribs['content'];
    console.log();
    return {
      name: $('h1').first().contents()[0].data,
      img,
      url,
      style,
      abv,
      brewer,
      location,
      score
    }
  }

}